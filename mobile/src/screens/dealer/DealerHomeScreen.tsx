import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Alert, ActivityIndicator, StatusBar, Dimensions, Platform } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import { getDealerDashboard, getDealerReferral, validateCoupon, redeemCoupon, getDealerRedemptions, getDealerRedemptionSummary, DealerRedemption, DealerRedemptionSummary } from '../../services/api';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import mascotImage from '../../../assets/images/mascot_v3.png';
import GlobalHeader from '../../components/GlobalHeader';

const { width: W } = Dimensions.get('window');
const H_PAD = 16;
const CARD_GAP = 12;
const CARD_W = (W - H_PAD * 2 - CARD_GAP) / 2;
const PRODUCT_CARD_W = W * 0.46;

const C = {
  green:      '#3e7025',
  greenDark:  '#173b1b',
  greenMid:   '#4b7f21',
  greenLight: '#72a52f',
  lime:       '#cbe968',
  limePale:   '#edf3d7',
  ink:        '#1d3322',
  muted:      '#71806d',
  bg:         '#f2f6ed',
  card:       '#ffffff',
  line:       '#d7e4cf',
  pale:       '#eff7df',
  amber:      '#d97706',
  amberPale:  '#fffbeb',
  purple:     '#6d28d9',
  purplePale: '#f5f3ff',
  red:        '#b91c1c',
  redPale:    '#fef2f2',
  teal:       '#0d7d72',
  tealPale:   '#e6f7f5',
};

const QUICK_ACTIONS = [
  { id: 'scan',       icon: 'qrcode-scan',               lib: 'mci', color: C.green,    bg: C.limePale,  label: 'Scan Coupon',    sub: 'Redeem offers'       },
  { id: 'inspect',    icon: 'leaf',                      lib: 'mci', color: C.amber,    bg: C.amberPale, label: 'AI Crop Doctor', sub: 'Identify problems'   },
  { id: 'calculator', icon: 'calculator-variant-outline',lib: 'mci', color: C.teal,     bg: C.tealPale,  label: 'Spray Calc',     sub: 'Get right dosage'    },
  { id: 'assistant',  icon: 'chat-processing-outline',   lib: 'mci', color: C.purple,   bg: C.purplePale,label: 'Ask Dr. CLSL',      sub: 'Your farming friend' },
] as const;

type Dashboard={dealer:{name:string;dealer_code:string};targets:{monthly_referrals:number;total_referrals:number};redemptions:{monthly_count:number;monthly_amount:number}};
type Referral={dealer_name:string;token:string;qr_data_url?:string|null};

export default function DealerHomeScreen({onNavigate}:{onNavigate:(s:string)=>void}){
  const {user,token}=useAuth(); 
  const [dashboard,setDashboard]=useState<Dashboard|null>(null); 
  const [referral,setReferral]=useState<Referral|null>(null); 
  const [showReferral,setShowReferral]=useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  
  // Dashboard summary state
  const [summary, setSummary] = useState<DealerRedemptionSummary | null>(null);
  const [recentRedemptions, setRecentRedemptions] = useState<DealerRedemption[]>([]);

  // Scanner state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannedData, setScannedData] = useState<any>(null);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseReference, setPurchaseReference] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedPacking, setSelectedPacking] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const scanLocked = useRef(false);
  
  useEffect(()=>{
    if(token){
        getDealerDashboard(token).then(setDashboard).catch(()=>{});
        getDealerRedemptionSummary(token).then(setSummary).catch(()=>{});
        getDealerRedemptions(token, 'month').then(h => setRecentRedemptions(h.items || [])).catch(()=>{});
    }
  },[token]);
  const openReferral=async()=>{setShowReferral(true);if(token&&!referral)getDealerReferral(token).then(setReferral).catch(()=>{})};
  
  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const p = await requestCameraPermission();
      if (!p.granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to scan coupons and rewards.');
        return;
      }
    }
    scanLocked.current = false;
    setIsCameraOpen(true);
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanLocked.current) return;
    scanLocked.current = true;
    setIsCameraOpen(false);
    
    if (!token) return;

    try {
      const response = await validateCoupon(token, data);
      const type = response.campaign_name || "Discount Coupon";
      const offer = response.discount_type === "percentage" ? `${response.discount_value}% OFF` : `₹${response.discount_value} OFF`;
      
      setScannedData({
        code: response.coupon_code,
        type,
        offer,
        criteria: response.criteria,
        products: response.products || [],
        packings: response.packings || [],
        requiresPurchaseAmount: response.requires_purchase_amount,
      });
      setPurchaseAmount('');
      setPurchaseReference('');
      setSelectedProduct(response.products?.length === 1 ? response.products[0] : '');
      setSelectedPacking(response.packings?.length === 1 ? response.packings[0] : '');
    } catch (e: any) {
      const title = e?.status === 401 || e?.status === 403 ? 'Dealer sign-in required' : e?.status >= 500 ? 'Coupon service unavailable' : 'Coupon not accepted';
      Alert.alert(title, e.message || "Failed to validate coupon.");
    }
  };

  const processRedemption = () => {
    if (scannedData?.products?.length && !selectedProduct) {
      Alert.alert('Select product', 'Select the CLSL product purchased by the farmer.');
      return;
    }
    if (scannedData?.packings?.length && !selectedPacking) {
      Alert.alert('Select pack size', 'Select the pack size purchased by the farmer.');
      return;
    }
    const numericPurchaseAmount = purchaseAmount.trim() ? Number(purchaseAmount) : undefined;
    if (scannedData?.requiresPurchaseAmount && (!numericPurchaseAmount || numericPurchaseAmount <= 0)) {
      Alert.alert('Enter bill amount', 'The purchase amount is required to calculate this percentage discount.');
      return;
    }
    Alert.alert(
      "Confirm Redemption",
      `Are you sure you want to redeem this offer? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Yes, Redeem", 
          style: "destructive",
          onPress: async () => {
            if (!token || !scannedData || redeeming) return;
            setRedeeming(true);
            try {
              const result = await redeemCoupon(token, scannedData.code, {
                purchaseReference: purchaseReference.trim() || undefined,
                purchaseAmount: numericPurchaseAmount,
                productName: selectedProduct || undefined,
                packing: selectedPacking || undefined,
              });
              const recordedAmount = Number(result.amount_redeemed ?? result.discount_value ?? 0);
              Alert.alert("Coupon redeemed", `₹${recordedAmount.toFixed(2)} discount recorded successfully.`);
              setScannedData(null);
              // Refresh dashboard
              if (token) {
                  getDealerDashboard(token).then(setDashboard).catch(()=>{});
                  getDealerRedemptionSummary(token).then(setSummary).catch(()=>{});
                  getDealerRedemptions(token, 'month').then(h => setRecentRedemptions(h.items || [])).catch(()=>{});
              }
            } catch (e: any) {
              Alert.alert("Redemption Failed", e.message || "Failed to redeem coupon.");
            } finally {
              setRedeeming(false);
            }
          }
        }
      ]
    );
  };

  const renderIcon = (action: any) => {
    return action.lib === 'mci'
      ? <MaterialCommunityIcons name={action.icon as any} size={28} color={action.color} />
      : <Ionicons name={action.icon as any} size={28} color={action.color} />;
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top bar */}
      <GlobalHeader tagline={dashboard?.dealer.name || user?.dealer_name || undefined} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        
        {/* Hero banner */}
        <TouchableOpacity style={s.heroBanner} onPress={openReferral} activeOpacity={0.9}>
          <LinearGradient colors={[C.greenDark, '#1f4726']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroGrad}>
            <View style={s.heroBubble1} />
            <View style={s.heroBubble2} />
            <View style={s.heroContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                <View style={[s.heroBadge, { marginBottom: 0 }]}>
                  <Ionicons name="people" size={10} color={C.lime} />
                  <Text style={s.heroBadgeText}>REFER & EARN</Text>
                </View>
                {user?.district && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999 }}>
                    <Ionicons name="location-outline" size={10} color={C.lime} />
                    <Text style={{ fontSize: 8.5, color: '#fff', marginLeft: 2, fontWeight: '700' }}>{user.district}</Text>
                  </View>
                )}
              </View>
              
              <Text style={{ fontSize: 12, color: C.lime, fontWeight: '700', marginBottom: 2 }}>Welcome, {user?.first_name || 'Partner'} 👋</Text>
              <Text style={s.heroTitle}>Grow your{'\n'}network</Text>
              <Text style={s.heroBody}>Share your QR code to invite farmers and earn rewards.</Text>
              
              <View style={s.heroBtn}>
                <Ionicons name="qr-code" size={14} color={C.greenDark} />
                <Text style={s.heroBtnText}>Show My QR</Text>
              </View>
            </View>
            <Image source={mascotImage} style={{ position: 'absolute', right: 5, bottom: -5, width: 130, height: 130, aspectRatio: 1 }} resizeMode="contain" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Live stats bar */}
        <View style={s.statsBarWrapper}>
            <View style={s.statsBar}>
                <View style={s.statItem}>
                    <Text style={s.statVal}>{dashboard?.targets.total_referrals || 0}</Text>
                    <Text style={s.statLabel}>FARMERS</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                    <Text style={s.statVal}>₹{dashboard?.redemptions.monthly_amount || 0}</Text>
                    <Text style={s.statLabel}>THIS MONTH</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                    <Text style={s.statVal}>{dashboard?.redemptions.monthly_count || 0}</Text>
                    <Text style={s.statLabel}>COUPONS</Text>
                </View>
            </View>
        </View>

        {/* Quick actions — 2 × 2 grid */}
        <Text style={s.sectionTitle}>Dealer Actions</Text>
        <View style={s.quickGrid}>
          {QUICK_ACTIONS.map(action => (
            <TouchableOpacity
              key={action.id}
              style={s.quickCard}
              onPress={() => {
                  if (action.id === 'scan') openCamera();
                  else onNavigate?.(action.id);
              }}
              activeOpacity={0.76}
            >
              <View style={s.quickTop}>
                <View style={[s.quickIconBox, { backgroundColor: action.bg }]}>
                  {renderIcon(action)}
                </View>
                <Ionicons name="arrow-forward-circle-outline" size={18} color={action.color} />
              </View>
              <Text style={s.quickLabel}>{action.label}</Text>
              <Text style={s.quickSub}>{action.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Monthly progress</Text>
        </View>
        <View style={s.progressCard}>
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
                <Text style={{fontSize: 14, fontWeight: '700', color: C.ink}}>Farmers Connected</Text>
                <Text style={{fontSize: 14, fontWeight: '900', color: C.green}}>{dashboard?.targets.monthly_referrals || 0}</Text>
            </View>
            <View style={s.progress}>
                <View style={[s.progressFill,{width:`${Math.min(100,(dashboard?.targets.monthly_referrals||0)*10)}%`}]}/>
            </View>
            <Text style={{fontSize: 12, color: C.muted, marginTop: 8}}>Great job! You are expanding your network.</Text>
        </View>

        {/* Recent Scanned Coupons */}
        <View style={[s.sectionRow, {marginTop: 24}]}>
          <Text style={s.sectionTitle}>Recent Coupons Scanned</Text>
          <TouchableOpacity onPress={() => onNavigate('redeem')}><Text style={{color: C.green, fontWeight: '800'}}>View All</Text></TouchableOpacity>
        </View>
        <View style={s.listCard}>
          {recentRedemptions.length > 0 ? recentRedemptions.slice(0, 3).map(item => (
            <View key={item.id} style={s.listItemRow}>
              <View style={s.listItemMain}><Text style={s.listItemTitle}>{item.campaign_name}</Text><Text style={s.listItemSub}>{item.coupon_code} · {new Date(item.redeemed_at).toLocaleDateString('en-IN')}</Text></View>
              <View style={s.listItemAmount}><Text style={s.listItemVal}>₹{Number(item.amount_redeemed || 0).toFixed(0)}</Text><Text style={[s.listItemStatus, item.settled && { color: C.green }]}>{item.settled ? 'settled' : 'outstanding'}</Text></View>
            </View>
          )) : <Text style={s.emptyList}>No coupons scanned recently.</Text>}
        </View>

        {/* Recent Credit Notes */}
        <View style={[s.sectionRow, {marginTop: 24}]}>
          <Text style={s.sectionTitle}>Credit Notes</Text>
          <TouchableOpacity onPress={() => onNavigate('redeem')}><Text style={{color: C.green, fontWeight: '800'}}>Statement</Text></TouchableOpacity>
        </View>
        <View style={s.listCard}>
          {summary?.credit_notes?.length ? summary.credit_notes.slice(0, 3).map(c => (
            <View key={c.id} style={s.listItemRow}>
              <View style={s.listItemMain}>
                <Text style={s.listItemTitle}>{c.note_number}</Text>
                <Text style={s.listItemSub}>{new Date(c.generated_at).toLocaleDateString('en-IN')}</Text>
              </View>
              <View style={s.listItemAmount}>
                <Text style={s.listItemVal}>₹{c.total_amount}</Text>
                <Text style={[s.listItemStatus, c.status === 'settled' && { color: C.green }]}>{c.status}</Text>
              </View>
            </View>
          )) : <Text style={s.emptyList}>No credit notes yet.</Text>}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Referral Modal */}
      <Modal visible={showReferral} animationType="slide" onRequestClose={()=>setShowReferral(false)}>
        <View style={s.modal}><View style={s.modalHead}><TouchableOpacity onPress={()=>setShowReferral(false)} style={s.close}><Ionicons name="close" size={24} color={C.green}/></TouchableOpacity><Text style={s.modalTitle}>Invite farmers</Text><View style={{width:44}}/></View><ScrollView contentContainerStyle={s.modalBody}><Text style={s.modalLead}>Farmers can scan this QR or enter the code manually in CLSL AI.</Text>
        
        {referral?.token ? (
          <View style={{ padding: 20, backgroundColor: '#fff', borderRadius: 16, marginVertical: 20, alignSelf: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 }}>
            <QRCode value={`https://ai.croplifescience.com/?ref=${referral.token}`} size={200} />
          </View>
        ) : (
          <View style={s.qrLoading}><ActivityIndicator color={C.green} size="large" /><Text style={{color: C.muted, marginTop: 10, fontSize:14}}>Loading secure QR…</Text></View>
        )}

        <Text style={s.codeLabel}>FARMER REFERRAL CODE</Text><Text selectable style={s.code}>{referral?.token||'·······'}</Text><Text style={s.dealerName}>{referral?.dealer_name||dashboard?.dealer.name}</Text>
        
        <TouchableOpacity style={s.modalActionBtn} onPress={()=>referral&&Linking.openURL(`whatsapp://send?text=${encodeURIComponent(`Hi, use referral code ${referral.token} in the CLSL AI app to get rewards on CLSL products.`)}`)}>
          <Ionicons name="logo-whatsapp" size={21} color="#FFF"/>
          <Text style={s.modalActionText}>Share on WhatsApp</Text>
        </TouchableOpacity>
        </ScrollView></View>
      </Modal>

      {/* Camera Scanner Modal */}
      <Modal visible={isCameraOpen} animationType="slide" transparent>
        <View style={s.camOverlay}>
          <TouchableOpacity style={s.camCloseBtn} onPress={() => setIsCameraOpen(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={s.camFrame}>
            {isCameraOpen && (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                onBarcodeScanned={handleBarcodeScanned}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              />
            )}
          </View>
          <Text style={s.camHint}>Position the QR code within the frame</Text>
        </View>
      </Modal>

      {/* Scanned Data Confirmation Modal */}
      <Modal visible={!!scannedData} animationType="fade" transparent statusBarTranslucent>
        <View style={s.modalOverlay}>
          <View style={s.scannedCard}>
            <View style={s.scannedHeader}>
              <View style={s.scannedIconWrapper}>
                <Ionicons name="ticket-outline" size={28} color="#FFF" />
              </View>
              <Text style={s.scannedTitle}>{scannedData?.type || 'Coupon'} Scanned</Text>
            </View>
            
            <ScrollView style={s.scannedBody} contentContainerStyle={s.scannedBodyContent} keyboardShouldPersistTaps="handled">
              <Text style={s.scannedLabel}>COUPON CODE</Text>
              <Text style={s.scannedValue}>{scannedData?.code}</Text>
              
              <View style={s.divider} />
              
              <Text style={s.scannedLabel}>DEALER ACTION (OFFER TO GIVE)</Text>
              <Text style={s.scannedOffer}>{scannedData?.offer}</Text>
              
              <View style={s.criteriaBox}>
                <Ionicons name="information-circle" size={22} color="#064878" />
                <View style={{flex:1}}>
                  <Text style={s.criteriaTitle}>Verification Criteria</Text>
                  <Text style={s.criteriaText}>{scannedData?.criteria}</Text>
                </View>
              </View>
              {!!scannedData?.products?.length && <View style={s.redeemField}>
                <Text style={s.redeemFieldLabel}>PURCHASED PRODUCT</Text>
                <View style={s.choiceWrap}>{scannedData.products.map((product: string) => <TouchableOpacity key={product} style={[s.choiceChip,selectedProduct===product&&s.choiceChipOn]} onPress={()=>setSelectedProduct(product)}><Text style={[s.choiceChipText,selectedProduct===product&&s.choiceChipTextOn]}>{product}</Text></TouchableOpacity>)}</View>
              </View>}
              {!!scannedData?.packings?.length && <View style={s.redeemField}>
                <Text style={s.redeemFieldLabel}>PACK SIZE</Text>
                <View style={s.choiceWrap}>{scannedData.packings.map((packing: string) => <TouchableOpacity key={packing} style={[s.choiceChip,selectedPacking===packing&&s.choiceChipOn]} onPress={()=>setSelectedPacking(packing)}><Text style={[s.choiceChipText,selectedPacking===packing&&s.choiceChipTextOn]}>{packing}</Text></TouchableOpacity>)}</View>
              </View>}
              {scannedData?.requiresPurchaseAmount&&<View style={s.redeemField}><Text style={s.redeemFieldLabel}>BILL AMOUNT (₹)</Text><TextInput style={s.redeemInput} value={purchaseAmount} onChangeText={setPurchaseAmount} keyboardType="decimal-pad" placeholder="Enter purchase amount"/></View>}
              <View style={s.redeemField}><Text style={s.redeemFieldLabel}>BILL / INVOICE NUMBER (OPTIONAL)</Text><TextInput style={s.redeemInput} value={purchaseReference} onChangeText={setPurchaseReference} placeholder="Enter reference" autoCapitalize="characters"/></View>
            </ScrollView>

            <View style={s.scannedActions}>
              <TouchableOpacity style={s.scannedBtnCancel} onPress={() => setScannedData(null)}>
                <Text style={s.scannedBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.scannedBtnRedeem,redeeming&&s.buttonDisabled]} disabled={redeeming} onPress={processRedemption}>
                <Text style={s.scannedBtnRedeemText}>{redeeming?'Redeeming…':'Redeem Offer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({

  // Live stats bar
  statsBarWrapper: { borderRadius: 16, overflow: 'hidden', marginBottom: 24, elevation:2, shadowColor:'#000', shadowOpacity: 0.1, shadowOffset: {width:0, height:2} },
  statsBar: {
    flexDirection: 'row', backgroundColor: C.greenDark,
    paddingVertical: 14, paddingHorizontal: 20,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '900', color: C.lime, letterSpacing: -0.3 },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 },

  // Progress card
  progressCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.line },
  progress: { height:10, backgroundColor:'#DDE8EE', borderRadius:6, overflow:'hidden' },
  progressFill: { height:'100%', backgroundColor:C.green, borderRadius:6 },

  // Lists
  listCard: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  listItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.line },
  listItemMain: { flex: 1, paddingRight: 10 },
  listItemTitle: { fontSize: 14, fontWeight: '800', color: C.ink, marginBottom: 2 },
  listItemSub: { fontSize: 11, color: C.muted, fontWeight: '600' },
  listItemAmount: { alignItems: 'flex-end' },
  listItemVal: { fontSize: 15, fontWeight: '900', color: C.ink, marginBottom: 2 },
  listItemStatus: { fontSize: 10, fontWeight: '700', color: C.amber, textTransform: 'uppercase' },
  emptyList: { padding: 24, textAlign: 'center', color: C.muted, fontSize: 13, fontWeight: '600' },

  // Referral Modal
  modal: { flex:1, backgroundColor:C.bg },
  modalHead: { height:80, backgroundColor:'#FFF', paddingTop: 35, paddingHorizontal:16, flexDirection:'row', alignItems:'center', justifyContent:'space-between', borderBottomWidth:1, borderBottomColor:C.line },
  close: { width:44, height:44, borderRadius:14, backgroundColor:C.pale, alignItems:'center', justifyContent:'center' },
  modalTitle: { fontSize:20, fontWeight:'900', color:C.ink },
  modalBody: { padding:22, alignItems:'center', gap:16 },
  modalLead: { color:C.muted, fontSize:15, lineHeight:22, textAlign:'center' },
  qrLoading: { width:240, height:240, borderRadius:22, backgroundColor:'#FFF', alignItems:'center', justifyContent:'center', gap:12 },
  codeLabel: { color:C.muted, fontSize:11, fontWeight:'900', letterSpacing:1.3 },
  code: { fontSize:34, fontWeight:'900', letterSpacing:5, color:C.green },
  dealerName: { color:C.ink, fontWeight:'800', marginBottom:8 },
  modalActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.green, borderRadius: 12, paddingVertical: 14, gap: 8, width:'100%' },
  modalActionText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Camera scanner
  camOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  camCloseBtn: { position: 'absolute', top: 52, right: 24, backgroundColor: 'rgba(255,255,255,0.2)', padding: 12, borderRadius: 20 },
  camFrame: { width: 250, height: 250, borderWidth: 3, borderColor: C.lime, borderRadius: 20, overflow: 'hidden' },
  camHint: { color: '#fff', marginTop: 24, fontSize: 14, fontWeight: '600' },

  // Scan modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  scannedCard: { backgroundColor: '#FFF', borderRadius: 24, overflow: 'hidden', maxHeight: '92%', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  scannedHeader: { backgroundColor: C.green, padding: 24, alignItems: 'center', gap: 10 },
  scannedIconWrapper: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  scannedTitle: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  scannedBody: { flexShrink: 1 },
  scannedBodyContent: { padding: 28 },
  scannedLabel: { fontSize: 11, color: C.muted, fontWeight: '800', letterSpacing: 0.8 },
  scannedValue: { fontSize: 22, color: C.ink, fontWeight: '900', marginTop: 4, letterSpacing: 2 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 18 },
  scannedOffer: { fontSize: 26, color: C.green, fontWeight: '900', marginTop: 4 },
  criteriaBox: { backgroundColor: '#F0F7FB', padding: 16, borderRadius: 14, marginTop: 24, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: '#DCECF5' },
  criteriaTitle: { color: '#064878', fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  criteriaText: { color: '#0A62A3', fontSize: 14, marginTop: 6, lineHeight: 20, fontWeight: '500' },
  redeemField: { marginTop: 16 },
  redeemFieldLabel: { fontSize: 10, color: C.muted, fontWeight: '900', letterSpacing: 0.7, marginBottom: 7 },
  redeemInput: { borderWidth: 1, borderColor: C.line, backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 13, minHeight: 46, color: C.ink, fontSize: 14 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: { borderWidth: 1, borderColor: C.line, backgroundColor: '#FFF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  choiceChipOn: { borderColor: C.green, backgroundColor: C.pale },
  choiceChipText: { color: C.muted, fontSize: 12, fontWeight: '700' },
  choiceChipTextOn: { color: C.greenDark },
  scannedActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: '#FAFAFA' },
  scannedBtnCancel: { flex: 1, padding: 20, alignItems: 'center', borderRightWidth: 1, borderRightColor: C.line },
  scannedBtnCancelText: { color: C.muted, fontWeight: '800', fontSize: 16 },
  scannedBtnRedeem: { flex: 1, padding: 20, alignItems: 'center', backgroundColor: '#FFF' },
  buttonDisabled: { opacity: 0.55 },
  scannedBtnRedeemText: { color: C.green, fontWeight: '900', fontSize: 16 },

  root: { flex: 1, backgroundColor: C.bg },

  // Top bar
  topBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 34,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  topBarHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topBarLogo: { width: 34, height: 34, borderRadius: 8 },
  topBarBrand: { fontSize: 16, fontWeight: '900', color: '#0B4783', letterSpacing: -0.3 },
  topBarTagline: { fontSize: 10, color: '#0B4783', marginTop: 1 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  topBarBtn: { position: 'relative', padding: 4 },
  notifDot: {
    position: 'absolute', top: 2, right: 2,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: C.lime, borderWidth: 1.5, borderColor: C.greenDark,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.lime, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: { color: C.greenDark, fontWeight: '900', fontSize: 15 },

  scroll: { paddingHorizontal: H_PAD, paddingTop: 24 },

  // Greeting
  greetRow: { paddingHorizontal: 4 },
  greetSub: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.85)' },
  greetName: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginTop: 2 },
  locationPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, alignSelf: 'flex-start', marginTop: 12,
  },
  locationText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Hero banner
  heroBanner: {
    borderRadius: 18, overflow: 'hidden', marginBottom: 24,
    shadowColor: C.greenDark, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2, shadowRadius: 16, elevation: 6,
  },
  heroGrad: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingLeft: 16, paddingTop: 18, paddingBottom: 0,
    minHeight: 120, overflow: 'hidden',
  },
  heroBubble1: {
    position: 'absolute', top: -50, right: -40,
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 30, borderColor: 'rgba(203,233,104,0.13)',
  },
  heroBubble2: {
    position: 'absolute', bottom: 20, left: -30,
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 16, borderColor: 'rgba(255,255,255,0.08)',
  },
  heroContent: { width: W * 0.54, paddingBottom: 16 },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(203,233,104,0.2)',
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 999, alignSelf: 'flex-start', marginBottom: 8,
  },
  heroBadgeText: { fontSize: 8, fontWeight: '800', color: C.lime, letterSpacing: 1 },
  heroTitle: {
    fontSize: 17, fontWeight: '900', color: '#fff',
    lineHeight: 22, letterSpacing: -0.4, marginBottom: 6,
  },
  heroBody: {
    fontSize: 10, color: 'rgba(255,255,255,0.8)',
    lineHeight: 14, marginBottom: 12,
  },
  heroBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.lime, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  heroBtnText: { fontSize: 11, fontWeight: '800', color: C.ink },

  // Live stats bar


  // Section headers
  sectionTitle: { fontSize: 17, fontWeight: '900', color: C.ink, letterSpacing: -0.3, marginBottom: 12 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAll: { fontSize: 12, fontWeight: '700', color: C.green },

  // Quick actions grid
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, marginBottom: 24 },
  quickCard: {
    width: CARD_W, backgroundColor: C.card, borderRadius: 16,
    padding: 14, borderWidth: 1, borderColor: C.line,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    minHeight: 110,
  },
  quickTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  quickIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  quickLabel: { fontSize: 13, fontWeight: '900', color: C.ink, marginBottom: 2 },
  quickSub: { fontSize: 11, color: C.muted, fontWeight: '500', lineHeight: 14 },

  // Featured products strip
  productStrip: { paddingRight: H_PAD, paddingBottom: 6, gap: 12, marginBottom: 24 },
  productCard: {
    width: PRODUCT_CARD_W, backgroundColor: C.card,
    borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.line,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  productCardSkeleton: { height: 180, opacity: 0.4, backgroundColor: C.line },
  productImgBox: {
    width: '100%', height: 90, backgroundColor: C.bg,
    borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8,
    overflow: 'hidden',
  },
  productImg: { width: '100%', height: '100%' },
  catPill: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6 },
  catPillText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.3 },
  productName: { fontSize: 12, fontWeight: '800', color: C.ink, lineHeight: 16, marginBottom: 3 },
  productCommon: { fontSize: 10, color: C.muted, marginBottom: 6 },
  cropPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cropPill: { backgroundColor: C.limePale, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  cropPillText: { fontSize: 8.5, fontWeight: '600', color: C.green },
  cropMore: { fontSize: 8.5, fontWeight: '700', color: C.muted, alignSelf: 'center' },

  // Advisory card
  advisoryCard: {
    backgroundColor: '#fffbeb', borderRadius: 16, overflow: 'hidden',
    flexDirection: 'row', marginBottom: 20, borderWidth: 1, borderColor: '#fde68a',
    padding: 16, gap: 14,
    shadowColor: '#d97706', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 2,
  },
  advisoryIconBox: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#fef3c7',
    justifyContent: 'center', alignItems: 'center', marginTop: 2,
  },
  advisoryBody: { flex: 1 },
  advisoryTitle: { fontSize: 14, fontWeight: '800', color: '#92400e', marginBottom: 4 },
  advisoryText: { fontSize: 12, color: '#b45309', lineHeight: 18, marginBottom: 10, fontWeight: '500' },
  advisoryActionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  advisoryLink: { fontSize: 12, fontWeight: '800', color: '#b45309' },

  // Weather
  weatherStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: C.line, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  weatherIconBox: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: C.amberPale,
    justifyContent: 'center', alignItems: 'center',
  },
  weatherCenter: { flex: 1 },
  weatherTemp: { fontSize: 18, fontWeight: '900', color: C.ink },
  weatherCond: { fontSize: 12, fontWeight: '500', color: C.muted },
  weatherHint: { fontSize: 11.5, fontWeight: '700', color: C.green, marginTop: 3 },
  weatherRight: { alignItems: 'flex-end', gap: 4 },
  weatherStat: { fontSize: 12, fontWeight: '700', color: C.muted },

  // Ask Mitra promo
  mitraBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.greenDark, borderRadius: 20,
    overflow: 'hidden', paddingRight: 16,
    shadowColor: C.greenDark, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
    marginBottom: 10,
  },
  mitraMascot: { width: 100, height: 120 },
  mitraContent: { flex: 1, paddingVertical: 18 },
  mitraTitle: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.3, marginBottom: 5 },
  mitraSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.65)', lineHeight: 16, marginBottom: 12 },
  mitraBtn: {
    backgroundColor: C.lime, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start',
  },
  mitraBtnText: { fontSize: 12, fontWeight: '800', color: C.ink },

  // Modal
});
