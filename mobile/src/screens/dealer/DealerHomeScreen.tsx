import React, { useEffect, useState } from 'react';
import { Image, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getDealerDashboard, getDealerReferral } from '../../services/api';
import { AppColors, MobileScreen, shared } from '../../components/MobileScreen';
import { CameraView, useCameraPermissions } from 'expo-camera';
import mascotImage from '../../../assets/images/mascot_new.png';

type Dashboard={dealer:{name:string;dealer_code:string};targets:{monthly_referrals:number;total_referrals:number};redemptions:{monthly_count:number;monthly_amount:number}};
type Referral={dealer_name:string;token:string;qr_data_url?:string|null};

export default function DealerHomeScreen({onNavigate}:{onNavigate:(s:string)=>void}){
  const {user,token}=useAuth(); 
  const [dashboard,setDashboard]=useState<Dashboard|null>(null); 
  const [referral,setReferral]=useState<Referral|null>(null); 
  const [showReferral,setShowReferral]=useState(false);

  // Scanner state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannedData, setScannedData] = useState<any>(null);
  
  useEffect(()=>{if(token)getDealerDashboard(token).then(setDashboard).catch(()=>{})},[token]);
  const openReferral=async()=>{setShowReferral(true);if(token&&!referral)getDealerReferral(token).then(setReferral).catch(()=>{})};
  
  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const p = await requestCameraPermission();
      if (!p.granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to scan coupons and rewards.');
        return;
      }
    }
    setIsCameraOpen(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    setIsCameraOpen(false);
    
    // Determine if it's a reward or a coupon based on prefix.
    // E.g. REWARD-1-12345 or CLSL-COUPON-123
    let criteria = "";
    let offer = "";
    let type = "";
    
    if (data.startsWith('REWARD')) {
      type = "Loyalty Reward";
      offer = "Free 250ml pack of Meso Power";
      criteria = "Farmer must have purchased at least ₹1000 in the last 3 months.";
    } else {
      type = "Discount Coupon";
      offer = "20% OFF";
      criteria = "Valid only on minimum purchase of 3 bottles of Zyme 1L.";
    }

    setScannedData({
      code: data,
      type,
      offer,
      criteria
    });
  };

  const processRedemption = () => {
    Alert.alert(
      "Confirm Redemption",
      `Are you sure you want to redeem this ${scannedData?.type}? This action cannot be undone and will deduct points/use the coupon permanently.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Yes, Redeem", 
          style: "destructive",
          onPress: () => {
            // Here you would call backend API to redeem the coupon/reward
            // e.g. await redeemItem(token, scannedData.code)
            Alert.alert("Success", "Redemption logged successfully.");
            setScannedData(null);
          }
        }
      ]
    );
  };

  return <MobileScreen title="Dealer Partner" subtitle={dashboard?.dealer.name||user?.dealer_name||'CLSL network'}>
    <View style={styles.welcome}><View style={{flex:1}}><Text style={styles.hello}>Welcome, {user?.first_name}</Text><Text style={styles.welcomeSub}>Manage farmer referrals and coupon settlements.</Text></View><Image source={mascotImage} style={styles.mascot}/></View>
    <View style={styles.metrics}><Metric value={String(dashboard?.targets.total_referrals||0)} label="Farmers connected"/><Metric value={`₹${dashboard?.redemptions.monthly_amount||0}`} label="This month"/><Metric value={String(dashboard?.redemptions.monthly_count||0)} label="Coupons this month"/></View>
    <TouchableOpacity style={styles.referral} onPress={openReferral}><View style={styles.qr}><Ionicons name="qr-code" size={34} color={AppColors.blue}/></View><View style={{flex:1}}><Text style={styles.refTitle}>Farmer referral</Text><Text style={shared.body}>Show your QR or share your 7-character code.</Text></View><Ionicons name="chevron-forward" size={22} color={AppColors.blue}/></TouchableOpacity>
    <View style={shared.card}><Text style={shared.sectionTitle}>Quick actions</Text><View style={styles.actions}><Action icon="scan" label="Scan coupon" onPress={openCamera}/><Action icon="document-text-outline" label="Statements"/><Action icon="people-outline" label="Farmers"/><Action icon="gift-outline" label="Offers" onPress={()=>onNavigate('coupons')}/></View></View>
    <View style={shared.card}><Text style={shared.sectionTitle}>Monthly progress</Text><Text style={[shared.body,{marginTop:6}]}>{dashboard?.targets.monthly_referrals||0} farmers connected this month.</Text><View style={styles.progress}><View style={[styles.progressFill,{width:`${Math.min(100,(dashboard?.targets.monthly_referrals||0)*10)}%`}]}/></View></View>
    
    <Modal visible={showReferral} animationType="slide" onRequestClose={()=>setShowReferral(false)}>
      <View style={styles.modal}><View style={styles.modalHead}><TouchableOpacity onPress={()=>setShowReferral(false)} style={styles.close}><Ionicons name="close" size={24} color={AppColors.blue}/></TouchableOpacity><Text style={styles.modalTitle}>Invite farmers</Text><View style={{width:44}}/></View><ScrollView contentContainerStyle={styles.modalBody}><Text style={styles.modalLead}>Farmers can scan this QR or enter the code manually in CLSL AI.</Text>{referral?.qr_data_url?<Image source={{uri:referral.qr_data_url}} style={styles.qrImage}/>:<View style={styles.qrLoading}><Ionicons name="qr-code" size={76} color="#9BB0BE"/><Text style={shared.body}>Loading secure QR…</Text></View>}<Text style={styles.codeLabel}>FARMER REFERRAL CODE</Text><Text selectable style={styles.code}>{referral?.token||'·······'}</Text><Text style={styles.dealerName}>{referral?.dealer_name||dashboard?.dealer.name}</Text><TouchableOpacity style={shared.primary} onPress={()=>referral&&Linking.openURL(`whatsapp://send?text=${encodeURIComponent(`Hi, use referral code ${referral.token} in the CLSL AI app to get rewards on CLSL products.`)}`)}><Ionicons name="logo-whatsapp" size={21} color="#FFF"/><Text style={shared.primaryText}>Share on WhatsApp</Text></TouchableOpacity></ScrollView></View>
    </Modal>

    {/* Camera Scanner Modal */}
    <Modal visible={isCameraOpen} animationType="slide" transparent>
      <View style={styles.camOverlay}>
        <TouchableOpacity style={styles.camCloseBtn} onPress={() => setIsCameraOpen(false)}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.camFrame}>
          {isCameraOpen && (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={handleBarcodeScanned}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            />
          )}
        </View>
        <Text style={styles.camHint}>Position the QR code within the frame</Text>
      </View>
    </Modal>

    {/* Scanned Data Confirmation Modal */}
    <Modal visible={!!scannedData} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.scannedCard}>
          <View style={styles.scannedHeader}>
            <Ionicons name="scan-outline" size={32} color={AppColors.blue} />
            <Text style={styles.scannedTitle}>{scannedData?.type} Scanned</Text>
          </View>
          
          <View style={styles.scannedBody}>
            <Text style={styles.scannedLabel}>Code:</Text>
            <Text style={styles.scannedValue}>{scannedData?.code}</Text>
            
            <Text style={[styles.scannedLabel, {marginTop: 12}]}>Dealer action (Offer to give):</Text>
            <Text style={styles.scannedOffer}>{scannedData?.offer}</Text>
            
            <View style={styles.criteriaBox}>
              <Ionicons name="warning-outline" size={20} color="#B9770E" />
              <View style={{flex:1}}>
                <Text style={styles.criteriaTitle}>Verification Criteria</Text>
                <Text style={styles.criteriaText}>{scannedData?.criteria}</Text>
              </View>
            </View>
          </View>

          <View style={styles.scannedActions}>
            <TouchableOpacity style={styles.scannedBtnCancel} onPress={() => setScannedData(null)}>
              <Text style={styles.scannedBtnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.scannedBtnRedeem} onPress={processRedemption}>
              <Text style={styles.scannedBtnRedeemText}>Redeem Offer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

  </MobileScreen>
}

function Metric({value,label}:{value:string;label:string}){return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>}
function Action({icon,label,onPress}:{icon:'scan'|'document-text-outline'|'people-outline'|'gift-outline';label:string;onPress?:()=>void}){return <TouchableOpacity style={styles.action} onPress={onPress}><View style={styles.actionIcon}><Ionicons name={icon} size={23} color={AppColors.blue}/></View><Text style={styles.actionLabel}>{label}</Text></TouchableOpacity>}

const styles=StyleSheet.create({
  welcome:{backgroundColor:AppColors.blue,borderRadius:24,padding:20,flexDirection:'row',alignItems:'center'},
  hello:{color:'#FFF',fontSize:23,fontWeight:'900'},
  welcomeSub:{color:'#CDE0EC',lineHeight:20,marginTop:5},
  mascot:{width:74,height:74,borderRadius:22,marginLeft:12},
  metrics:{flexDirection:'row',gap:8},
  metric:{flex:1,backgroundColor:'#FFF',borderRadius:17,padding:13,borderWidth:1,borderColor:AppColors.line},
  metricValue:{fontSize:20,color:AppColors.ink,fontWeight:'900'},
  metricLabel:{color:AppColors.muted,fontSize:10,lineHeight:14,marginTop:4},
  referral:{...shared.card,flexDirection:'row',alignItems:'center',gap:13},
  qr:{width:58,height:58,borderRadius:18,backgroundColor:AppColors.pale,alignItems:'center',justifyContent:'center'},
  refTitle:{color:AppColors.ink,fontSize:18,fontWeight:'900'},
  actions:{flexDirection:'row',justifyContent:'space-between',marginTop:17},
  action:{width:'23%',alignItems:'center'},
  actionIcon:{width:51,height:51,borderRadius:17,backgroundColor:AppColors.pale,alignItems:'center',justifyContent:'center'},
  actionLabel:{fontSize:11,color:AppColors.ink,fontWeight:'700',textAlign:'center',marginTop:7},
  progress:{height:9,backgroundColor:'#DDE8EE',borderRadius:6,overflow:'hidden',marginTop:15},
  progressFill:{height:'100%',backgroundColor:AppColors.green,borderRadius:6},
  modal:{flex:1,backgroundColor:AppColors.bg},
  modalHead:{height:80,backgroundColor:'#FFF',paddingTop:25,paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:AppColors.line},
  close:{width:44,height:44,borderRadius:14,backgroundColor:AppColors.pale,alignItems:'center',justifyContent:'center'},
  modalTitle:{fontSize:20,fontWeight:'900',color:AppColors.ink},
  modalBody:{padding:22,alignItems:'center',gap:16},
  modalLead:{color:AppColors.muted,fontSize:15,lineHeight:22,textAlign:'center'},
  qrImage:{width:240,height:240,borderRadius:22,backgroundColor:'#FFF'},
  qrLoading:{width:240,height:240,borderRadius:22,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center',gap:12},
  codeLabel:{color:AppColors.muted,fontSize:11,fontWeight:'900',letterSpacing:1.3},
  code:{fontSize:34,fontWeight:'900',letterSpacing:5,color:AppColors.blue},
  dealerName:{color:AppColors.ink,fontWeight:'800',marginBottom:8},

  camOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  camCloseBtn: { position: 'absolute', top: 52, right: 24, backgroundColor: 'rgba(255,255,255,0.2)', padding: 12, borderRadius: 20 },
  camFrame: { width: 250, height: 250, borderWidth: 3, borderColor: AppColors.green, borderRadius: 20, overflow: 'hidden' },
  camHint: { color: '#fff', marginTop: 24, fontSize: 14, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 },
  scannedCard: { backgroundColor: '#FFF', borderRadius: 24, overflow: 'hidden' },
  scannedHeader: { backgroundColor: AppColors.pale, padding: 24, alignItems: 'center', gap: 10 },
  scannedTitle: { fontSize: 20, fontWeight: '900', color: AppColors.ink },
  scannedBody: { padding: 24 },
  scannedLabel: { fontSize: 12, color: AppColors.muted, fontWeight: '700', textTransform: 'uppercase' },
  scannedValue: { fontSize: 16, color: AppColors.ink, fontWeight: '800', marginTop: 4 },
  scannedOffer: { fontSize: 22, color: AppColors.green, fontWeight: '900', marginTop: 4 },
  criteriaBox: { backgroundColor: '#FFF9E6', padding: 16, borderRadius: 12, marginTop: 24, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: '#FDEBD0' },
  criteriaTitle: { color: '#B9770E', fontWeight: '800', fontSize: 14 },
  criteriaText: { color: '#935116', fontSize: 13, marginTop: 4, lineHeight: 18 },
  
  scannedActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: AppColors.line },
  scannedBtnCancel: { flex: 1, padding: 20, alignItems: 'center', borderRightWidth: 1, borderRightColor: AppColors.line },
  scannedBtnCancelText: { color: AppColors.muted, fontWeight: '800', fontSize: 16 },
  scannedBtnRedeem: { flex: 1, padding: 20, alignItems: 'center', backgroundColor: AppColors.greenLight },
  scannedBtnRedeemText: { color: AppColors.green, fontWeight: '900', fontSize: 16 }
});
