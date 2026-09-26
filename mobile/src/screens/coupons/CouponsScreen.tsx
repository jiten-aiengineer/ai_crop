import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, TextInput, ScrollView, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getMyCoupons } from '../../services/api';
import { AppColors, MobileScreen, shared } from '../../components/MobileScreen';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';

type Coupon = { code: string; title: string; discount: string; expires: string; status: 'available' | 'used' | 'expired' };

export default function CouponsScreen({ onBack }: { onBack: () => void }) {
  const { user, token } = useAuth();
  const [tab, setTab] = useState<'available' | 'used'>('available');
  const [loading, setLoading] = useState(true);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  // Upgrade state
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeTerms, setUpgradeTerms] = useState(false);
  const [upgradePromos, setUpgradePromos] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [referral, setReferral] = useState('');
  
  // Camera state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    if (!token || user?.role !== 'farmer') {
      setLoading(false);
      return;
    }
    getMyCoupons(token).then(r => setCoupons(r.coupons.map((x, i) => ({
      code: String(x.code || `CLSL${i + 1}`),
      title: String(x.campaign_name || x.title || 'CLSL product reward'),
      discount: x.discount_type === 'percentage' ? `${x.discount_value}% OFF` : `₹${x.discount_value || 0} OFF`,
      expires: String(x.valid_until || 'See offer terms'),
      status: (x.status === 'redeemed' ? 'used' : 'available') as Coupon['status']
    })))).catch(() => setCoupons([])).finally(() => setLoading(false));
  }, [token, user?.role]);

  const doUpgrade = () => {
    if (!upgradeTerms || !upgradePromos) {
      Alert.alert('Required', 'You must accept both terms and promotional messages to upgrade to a farmer account.');
      return;
    }
    Alert.alert('Success', 'Your account has been upgraded to a Farmer profile. You can now access rewards and coupons.', [{ text: 'OK', onPress: () => {
      Alert.alert('Please restart the app', 'To apply your new role, please restart the app.');
    }}]);
  };

  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const p = await requestCameraPermission();
      if (!p.granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to scan QR codes.');
        return;
      }
    }
    setIsCameraOpen(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    setIsCameraOpen(false);
    setReferral(data);
  };

  if (user?.role !== 'farmer' && !isUpgrading) {
    return (
      <MobileScreen title="Rewards" subtitle="CLSL product offers" onBack={onBack}>
        <View style={[styles.empty, { marginTop: 40 }]}>
          <Ionicons name="lock-closed" size={48} color="#91A6B3" />
          <Text style={shared.sectionTitle}>Farmer Exclusive</Text>
          <Text style={[shared.body, { textAlign: 'center', marginHorizontal: 20 }]}>
            Rewards, offers, and coupons are available exclusively for registered farmers.
          </Text>
          <TouchableOpacity style={[shared.button, { marginTop: 20 }]} onPress={() => setIsUpgrading(true)}>
            <Text style={shared.buttonText}>I am a farmer</Text>
          </TouchableOpacity>
        </View>
      </MobileScreen>
    );
  }

  if (user?.role !== 'farmer' && isUpgrading) {
    return (
      <MobileScreen title="Upgrade Profile" subtitle="Access Farmer Rewards" onBack={() => setIsUpgrading(false)}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={shared.card}>
            <Text style={shared.sectionTitle}>Farmer Details</Text>
            
            <View style={{ marginTop: 16 }}>
              <Text style={shared.label}>Referral Code (Optional)</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput 
                  value={referral} 
                  onChangeText={setReferral} 
                  placeholder="E.g. CLSL123" 
                  style={[shared.input, { flex: 1 }]} 
                  autoCapitalize="characters" 
                />
                <TouchableOpacity style={styles.qrScanBtn} onPress={openCamera}>
                  <Ionicons name="qr-code-outline" size={24} color={AppColors.green} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ marginTop: 24, gap: 12 }}>
              <View style={styles.checkCard}>
                <TouchableOpacity onPress={() => setUpgradeTerms(!upgradeTerms)} style={{padding: 4}}>
                  <View style={[styles.checkbox, upgradeTerms && styles.checkboxActive]}>
                    {upgradeTerms && <Ionicons name="checkmark" size={12} color="#FFF" />}
                  </View>
                </TouchableOpacity>
                <View style={{ flex: 1, paddingVertical: 4 }}>
                  <Text style={styles.checkLabel}>I agree to the <Text style={{ color: AppColors.green, fontWeight: '700', textDecorationLine: 'underline' }} onPress={() => setShowTermsModal(true)}>Terms and Conditions</Text> <Text style={{color: 'red'}}>*</Text></Text>
                </View>
              </View>
              
              <TouchableOpacity style={styles.checkCard} onPress={() => setUpgradePromos(!upgradePromos)}>
                <View style={[styles.checkbox, upgradePromos && styles.checkboxActive]}>
                  {upgradePromos && <Ionicons name="checkmark" size={12} color="#FFF" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkLabel}>I agree to receive rewards and promotional messages <Text style={{color: 'red'}}>*</Text></Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[shared.button, { marginTop: 24 }]} onPress={doUpgrade}>
              <Text style={shared.buttonText}>Submit & Upgrade</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

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

        {/* Terms Modal */}
        <Modal visible={showTermsModal} animationType="slide" presentationStyle="pageSheet">
          <View style={{ flex: 1, backgroundColor: '#FFF' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E8EEF2' }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#102A43' }}>Terms & Conditions</Text>
              <TouchableOpacity onPress={() => setShowTermsModal(false)}>
                <Ionicons name="close-circle" size={32} color="#94A5B1" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Text style={{ fontSize: 14, lineHeight: 24, color: '#334E68' }}>
                Welcome to Crop Life Science Limited (CLSL) AI App. By using this application, you agree to the following terms:{'\n\n'}
                1. **Usage**: This application is provided for informational purposes only. The crop disease predictions, weather advisory, and spray calculations are algorithmic estimates and should not replace professional agricultural consultation.{'\n\n'}
                2. **Privacy & Data**: We value your privacy. We collect basic profile data (name, mobile) and approximate location to provide localized weather and nearest dealer mapping. We do not sell your personal data to third parties.{'\n\n'}
                3. **Promotions**: Farmers who opt-in may receive SMS or WhatsApp notifications containing rewards, promotional offers, and localized weather alerts. You can opt-out by contacting our support hotline.{'\n\n'}
                4. **Liability**: CLSL is not liable for any crop damage, financial loss, or incorrect product application resulting from the use of the tools in this app. Always read the printed label on the physical product before application.{'\n\n'}
                5. **Rewards**: Coupon codes are subject to verification by the local dealer. CLSL reserves the right to withdraw or modify promotional campaigns without prior notice.
              </Text>
            </ScrollView>
          </View>
        </Modal>
      </MobileScreen>
    );
  }

  const shown = coupons.filter(c => tab === 'used' ? c.status === 'used' : c.status === 'available');
  return <MobileScreen title="Rewards" subtitle="CLSL product offers" onBack={onBack}>
    <View style={styles.balance}><View><Text style={styles.balanceLabel}>Available rewards</Text><Text style={styles.balanceValue}>{coupons.filter(c => c.status === 'available').length}</Text></View><View style={styles.gift}><Ionicons name="gift" size={32} color="#FFF" /></View></View>
    <View style={styles.tabs}><Tab label="Available" active={tab === 'available'} onPress={() => setTab('available')} /><Tab label="Used" active={tab === 'used'} onPress={() => setTab('used')} /></View>
    {loading ? <ActivityIndicator size="large" color={AppColors.blue} style={{ marginTop: 40 }} /> : shown.length ? shown.map(c => <View key={c.code} style={styles.coupon}><View style={styles.cut} /><View style={{ flex: 1 }}><Text style={styles.discount}>{c.discount}</Text><Text style={styles.couponTitle}>{c.title}</Text><Text style={styles.expiry}>Valid until {c.expires}</Text></View><View style={styles.codeBox}><QRCode value={c.code} size={64} /><Text style={styles.code}>{c.code}</Text></View></View>) : <View style={styles.empty}><Ionicons name="ticket-outline" size={48} color="#91A6B3" /><Text style={shared.sectionTitle}>No {tab} rewards</Text><Text style={[shared.body, { textAlign: 'center' }]}>Eligible offers will appear here automatically.</Text></View>}
  </MobileScreen>;
}
function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <TouchableOpacity style={[styles.tab, active && styles.tabOn]} onPress={onPress}><Text style={[styles.tabText, active && styles.tabTextOn]}>{label}</Text></TouchableOpacity> }
const styles = StyleSheet.create({ 
  balance: { backgroundColor: AppColors.blue, borderRadius: 24, padding: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, 
  balanceLabel: { color: '#CCE1EE', fontWeight: '700' }, 
  balanceValue: { fontSize: 42, color: '#FFF', fontWeight: '900' }, 
  gift: { width: 62, height: 62, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.14)', alignItems: 'center', justifyContent: 'center' }, 
  tabs: { flexDirection: 'row', backgroundColor: '#E3EBF0', padding: 4, borderRadius: 15, marginVertical: 16 }, 
  tab: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 12 }, 
  tabOn: { backgroundColor: '#FFF' }, 
  tabText: { color: AppColors.muted, fontWeight: '800' }, 
  tabTextOn: { color: AppColors.blue }, 
  coupon: { backgroundColor: '#FFF', borderRadius: 20, borderWidth: 1, borderColor: AppColors.line, padding: 18, flexDirection: 'row', gap: 12, alignItems: 'center', overflow: 'hidden', marginBottom: 12 }, 
  cut: { position: 'absolute', left: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: AppColors.bg }, 
  discount: { color: AppColors.green, fontSize: 24, fontWeight: '900' }, 
  couponTitle: { color: AppColors.ink, fontWeight: '800', marginTop: 3 }, 
  expiry: { color: AppColors.muted, fontSize: 11, marginTop: 6 }, 
  codeBox: { borderLeftWidth: 1, borderStyle: 'dashed', borderColor: '#B8C8D2', paddingLeft: 12, alignItems: 'center', gap: 6 }, 
  code: { color: AppColors.blue, fontWeight: '900', fontSize: 13 }, 
  empty: { ...shared.card, alignItems: 'center', gap: 8, paddingVertical: 42 },
  
  checkCard: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1.5, borderColor: AppColors.line, borderRadius: 12, padding: 14, backgroundColor: '#FFF' },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: AppColors.line, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF', marginRight: 10 },
  checkboxActive: { backgroundColor: AppColors.green, borderColor: AppColors.green },
  checkLabel: { fontSize: 13, fontWeight: '600', color: AppColors.ink },

  qrScanBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: AppColors.greenLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: AppColors.green },
  camOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  camCloseBtn: { position: 'absolute', top: 52, right: 24, backgroundColor: 'rgba(0,0,0,0.5)', padding: 12, borderRadius: 20 },
  camFrame: { width: 250, height: 250, borderWidth: 3, borderColor: '#fff', borderRadius: 14, overflow: 'hidden' },
  camHint: { color: '#fff', marginTop: 20, fontSize: 13, fontWeight: '600' }
});
