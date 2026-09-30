import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Alert, ActivityIndicator, TextInput, Platform, Dimensions, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { downloadAndShareFile } from '../../utils/downloadHelper';
import { MobileScreen } from '../../components/MobileScreen';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../../contexts/AuthContext';
import { DEALER_API } from '../../config/api';
import { LinearGradient } from 'expo-linear-gradient';
import {
  DealerRedemption,
  DealerRedemptionSummary,
  getDealerRedemptions,
  getDealerRedemptionSummary,
  redeemCoupon,
  validateCoupon,
  settleAllRedemptions
} from '../../services/api';

const { width: W } = Dimensions.get('window');

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

export default function DealerRedeemScreen({ onBack }: { onBack: () => void }) {
  const { token } = useAuth();
  const [summary, setSummary] = useState<DealerRedemptionSummary | null>(null);
  const [redemptions, setRedemptions] = useState<DealerRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Scanner state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannedData, setScannedData] = useState<any>(null);
  const [manualCode, setManualCode] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseReference, setPurchaseReference] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedPacking, setSelectedPacking] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const scanLocked = useRef(false);

  const loadStatement = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [statement, history] = await Promise.all([
        getDealerRedemptionSummary(token),
        getDealerRedemptions(token, 'month'),
      ]);
      setSummary(statement);
      setRedemptions(history.items || []);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Dealer statement could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadStatement(); }, [loadStatement]);

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
      const resData = await validateCoupon(token, data);
      
      const type = resData.campaign_name || "Discount Coupon";
      const offer = resData.discount_type === "percentage" ? `${resData.discount_value}% OFF` : `₹${resData.discount_value} OFF`;
      const criteria = resData.criteria || "No specific criteria";

      setScannedData({
        code: resData.coupon_code,
        type,
        offer,
        criteria,
        products: resData.products || [],
        packings: resData.packings || [],
        requiresPurchaseAmount: resData.requires_purchase_amount,
      });
      setPurchaseAmount('');
      setPurchaseReference('');
      setSelectedProduct(resData.products?.length === 1 ? resData.products[0] : '');
      setSelectedPacking(resData.packings?.length === 1 ? resData.packings[0] : '');
    } catch (e: any) {
      const title = e?.status === 401 || e?.status === 403 ? 'Dealer sign-in required' : e?.status >= 500 ? 'Coupon service unavailable' : 'Coupon not accepted';
      Alert.alert(title, e.message || "Failed to validate coupon.");
      scanLocked.current = false;
    }
  };

  const validateManualCode = async () => {
    if (!manualCode.trim()) {
      Alert.alert('Enter coupon code', 'Enter the seven-character coupon shown by the farmer.');
      return;
    }
    scanLocked.current = false;
    await handleBarcodeScanned({ data: manualCode });
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
      `Are you sure you want to redeem this ${scannedData?.type}?`,
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
              await loadStatement();
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

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Ionicons name="arrow-back" size={24} color={C.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Redeem & Statement</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        
        <TouchableOpacity style={styles.scanBtn} onPress={openCamera} activeOpacity={0.9}>
          <LinearGradient colors={[C.greenDark, '#1f4726']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.scanGrad}>
            <View style={styles.scanIconWrap}>
              <Ionicons name="qr-code-outline" size={32} color={C.greenDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scanTitle}>Scan Coupon / QR</Text>
              <Text style={styles.scanSub}>Instantly verify and redeem farmer offers</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.4)" />
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.manualCard}>
          <Text style={styles.manualLabel}>Or enter the farmer's 7-character coupon</Text>
          <View style={styles.manualRow}>
            <TextInput style={styles.manualInput} value={manualCode} onChangeText={setManualCode} autoCapitalize="characters" maxLength={7} placeholder="Example: AB7CD9E" placeholderTextColor={C.muted}/>
            <TouchableOpacity style={styles.manualButton} onPress={()=>void validateManualCode()}>
              <Text style={styles.manualButtonText}>Verify</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Statement Summary</Text>
            <View style={{flexDirection: 'row', gap: 8}}>
              <TouchableOpacity onPress={() => { if(token) { downloadAndShareFile(`${DEALER_API}/me/redemptions/report.pdf?period=month&token=${encodeURIComponent(token)}`, 'Statement.pdf'); } }} disabled={loading} style={[styles.refreshBtn, {backgroundColor: C.limePale}]}>
                <Ionicons name="download-outline" size={18} color={C.greenDark}/>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void loadStatement()} disabled={loading} style={styles.refreshBtn}>
                <Ionicons name="refresh" size={18} color={C.green}/>
              </TouchableOpacity>
            </View>
          </View>
          
          {loading ? <ActivityIndicator style={{ marginTop: 20 }} color={C.green} /> : loadError ? <View style={styles.loadError}><Text style={styles.loadErrorText}>{loadError}</Text><TouchableOpacity onPress={() => void loadStatement()} style={styles.retryBtn}><Text style={styles.retryText}>Try again</Text></TouchableOpacity></View> : (
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>₹{Number(summary?.summary.all_amount || 0).toFixed(0)}</Text>
                <Text style={styles.statLabel}>Total Redeemed</Text>
              </View>
              <View style={styles.statBox}>
                <TouchableOpacity onPress={async () => {
                  if (summary?.summary.outstanding_amount && token) {
                    Alert.alert("Settle All", "Do you want to settle all outstanding redemptions? (For testing)", [
                      {text: "Cancel", style: "cancel"},
                      {text: "Settle Now", onPress: async () => {
                        try {
                          setLoading(true);
                          await settleAllRedemptions(token);
                          await loadStatement();
                          Alert.alert("Success", "All redemptions have been settled.");
                        } catch (e: any) {
                          Alert.alert("Error", e.message || "Failed to settle.");
                        } finally {
                          setLoading(false);
                        }
                      }}
                    ]);
                  }
                }}>
                  <Text style={[styles.statVal, { color: C.amber }]}>₹{Number(summary?.summary.outstanding_amount || 0).toFixed(0)}</Text>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6}}>
                    <Text style={[styles.statLabel, {marginTop: 0, marginRight: 4}]}>Outstanding</Text>
                    {Number(summary?.summary.outstanding_amount || 0) > 0 && <Ionicons name="checkmark-done-circle" size={14} color={C.amber} />}
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={styles.sectionTitle}>This month&apos;s scanned coupons</Text>
          {redemptions.length > 0 ? redemptions.slice(0, 20).map((item, i) => (
            <View key={item.id} style={[styles.redemptionRow, i === redemptions.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.redemptionMain}>
                <Text style={styles.noteTitle}>{item.campaign_name}</Text>
                <Text style={styles.noteDate}>{item.coupon_code} · {new Date(item.redeemed_at).toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.redemptionAmount}>
                <Text style={styles.noteAmount}>₹{Number(item.amount_redeemed || 0).toFixed(0)}</Text>
                <Text style={[styles.noteStatus, item.settled && { color: C.green }]}>{item.settled ? 'settled' : 'outstanding'}</Text>
              </View>
            </View>
          )) : <Text style={styles.emptyText}>No coupons redeemed this month.</Text>}
        </View>

        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={styles.sectionTitle}>Recent Credit Notes</Text>
          {summary?.credit_notes?.length ? summary.credit_notes.map((c, i) => (
            <View key={c.id} style={[styles.noteRow, i === summary.credit_notes.length - 1 && { borderBottomWidth: 0 }]}>
              <View>
                <Text style={styles.noteTitle}>{c.note_number}</Text>
                <Text style={styles.noteDate}>{new Date(c.generated_at).toLocaleDateString()}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.noteAmount}>₹{c.total_amount}</Text>
                <Text style={[styles.noteStatus, c.status === 'settled' && { color: C.green }]}>{c.status}</Text>
              </View>
            </View>
          )) : (
            <Text style={styles.emptyText}>No credit notes generated yet.</Text>
          )}
        </View>
      </ScrollView>

      {/* Camera Scanner Modal */}
      <Modal visible={isCameraOpen} animationType="slide" transparent>
        <View style={styles.camOverlay}>
          <TouchableOpacity style={styles.camCloseBtn} onPress={() => setIsCameraOpen(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.camFrame}>
            {isCameraOpen && (
              <CameraView style={StyleSheet.absoluteFill} facing="back" onBarcodeScanned={handleBarcodeScanned} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} />
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
              <Ionicons name="scan-outline" size={32} color={C.green} />
              <Text style={styles.scannedTitle}>{scannedData?.type} Scanned</Text>
            </View>
            <ScrollView style={styles.scannedBody} contentContainerStyle={styles.scannedBodyContent} keyboardShouldPersistTaps="handled">
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
              {!!scannedData?.products?.length && <View style={styles.redeemField}>
                <Text style={styles.redeemFieldLabel}>PURCHASED PRODUCT</Text>
                <View style={styles.choiceWrap}>{scannedData.products.map((product: string) => <TouchableOpacity key={product} style={[styles.choiceChip,selectedProduct===product&&styles.choiceChipOn]} onPress={()=>setSelectedProduct(product)}><Text style={[styles.choiceChipText,selectedProduct===product&&styles.choiceChipTextOn]}>{product}</Text></TouchableOpacity>)}</View>
              </View>}
              {!!scannedData?.packings?.length && <View style={styles.redeemField}>
                <Text style={styles.redeemFieldLabel}>PACK SIZE</Text>
                <View style={styles.choiceWrap}>{scannedData.packings.map((packing: string) => <TouchableOpacity key={packing} style={[styles.choiceChip,selectedPacking===packing&&styles.choiceChipOn]} onPress={()=>setSelectedPacking(packing)}><Text style={[styles.choiceChipText,selectedPacking===packing&&styles.choiceChipTextOn]}>{packing}</Text></TouchableOpacity>)}</View>
              </View>}
              {scannedData?.requiresPurchaseAmount&&<View style={styles.redeemField}><Text style={styles.redeemFieldLabel}>BILL AMOUNT (₹)</Text><TextInput style={styles.redeemInput} value={purchaseAmount} onChangeText={setPurchaseAmount} keyboardType="decimal-pad" placeholder="Enter purchase amount" placeholderTextColor={C.muted}/></View>}
              <View style={styles.redeemField}><Text style={styles.redeemFieldLabel}>BILL / INVOICE NUMBER (OPTIONAL)</Text><TextInput style={styles.redeemInput} value={purchaseReference} onChangeText={setPurchaseReference} placeholder="Enter reference" autoCapitalize="characters" placeholderTextColor={C.muted}/></View>
            </ScrollView>
            <View style={styles.scannedActions}>
              <TouchableOpacity style={styles.scannedBtnCancel} onPress={() => { setScannedData(null); scanLocked.current=false; }}><Text style={styles.scannedBtnCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.scannedBtnRedeem,redeeming&&styles.buttonDisabled]} disabled={redeeming} onPress={processRedemption}><Text style={styles.scannedBtnRedeemText}>{redeeming?'Redeeming…':'Redeem Offer'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
      flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 50 : 40,
      paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: C.line,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.pale, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: C.ink, marginLeft: 12 },
  
  scanBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 16, shadowColor: C.greenDark, shadowOffset: {width:0, height:6}, shadowOpacity: 0.2, shadowRadius: 16, elevation: 6 },
  scanGrad: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
  scanIconWrap: { width: 54, height: 54, borderRadius: 16, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' },
  scanTitle: { fontSize: 18, color: '#FFF', fontWeight: '900', letterSpacing: -0.3 },
  scanSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4, lineHeight: 16 },
  
  manualCard: { backgroundColor: '#FFF', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: C.line, marginBottom: 24, shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  manualLabel: { color: C.ink, fontSize: 13, fontWeight: '800', marginBottom: 12 },
  manualRow: { flexDirection: 'row', gap: 10 },
  manualInput: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, color: C.ink, letterSpacing: 2, fontWeight: '800', fontSize: 16, backgroundColor: C.bg },
  manualButton: { minWidth: 86, backgroundColor: C.green, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  manualButtonText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.line, shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: C.ink, letterSpacing: -0.3 },
  refreshBtn: { padding: 6, backgroundColor: C.pale, borderRadius: 8 },
  
  loadError: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  loadErrorText: { color: C.red, textAlign: 'center', fontWeight: '600', fontSize: 14 },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.redPale, borderRadius: 8 },
  retryText: { color: C.red, fontWeight: '800' },
  
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: { flex: 1, backgroundColor: C.pale, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: C.line },
  statVal: { fontSize: 24, fontWeight: '900', color: C.greenDark },
  statLabel: { fontSize: 11, color: C.muted, marginTop: 6, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  
  noteRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.pale },
  noteTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  noteDate: { fontSize: 12, color: C.muted, marginTop: 4, fontWeight: '600' },
  noteAmount: { fontSize: 16, fontWeight: '900', color: C.ink },
  noteStatus: { fontSize: 11, color: C.amber, fontWeight: '800', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  redemptionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.pale },
  redemptionMain: { flex: 1 },
  redemptionAmount: { alignItems: 'flex-end' },
  
  emptyText: { textAlign: 'center', color: C.muted, paddingVertical: 16, fontStyle: 'italic', fontSize: 13 },
  
  // Modals
  camOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  camCloseBtn: { position: 'absolute', top: 52, right: 24, backgroundColor: 'rgba(255,255,255,0.2)', padding: 12, borderRadius: 20 },
  camFrame: { width: 260, height: 260, borderWidth: 3, borderColor: C.lime, borderRadius: 24, overflow: 'hidden' },
  camHint: { color: '#fff', marginTop: 32, fontSize: 15, fontWeight: '600' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  scannedCard: { backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '92%' },
  scannedHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  scannedTitle: { fontSize: 22, fontWeight: '900', color: C.ink },
  scannedBody: { flexShrink: 1, backgroundColor: C.pale, borderRadius: 16, borderWidth: 1, borderColor: C.line },
  scannedBodyContent: { padding: 16 },
  scannedLabel: { fontSize: 11, color: C.muted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  scannedValue: { fontSize: 20, fontWeight: '900', color: C.ink, marginTop: 4, letterSpacing: 1 },
  scannedOffer: { fontSize: 24, fontWeight: '900', color: C.green, marginTop: 4 },
  criteriaBox: { flexDirection: 'row', gap: 12, backgroundColor: '#FDF2E9', padding: 14, borderRadius: 12, marginTop: 20, borderWidth: 1, borderColor: '#F5CBA7' },
  criteriaTitle: { fontSize: 12, fontWeight: '900', color: '#B9770E', textTransform: 'uppercase', letterSpacing: 0.5 },
  criteriaText: { fontSize: 13, color: '#935116', marginTop: 6, fontWeight: '600', lineHeight: 18 },
  redeemField: { marginTop: 18 },
  redeemFieldLabel: { fontSize: 10, color: C.muted, fontWeight: '900', letterSpacing: 0.8, marginBottom: 8 },
  redeemInput: { borderWidth: 1, borderColor: C.line, backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 14, minHeight: 48, color: C.ink, fontSize: 15, fontWeight: '600' },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: { borderWidth: 1, borderColor: C.line, backgroundColor: '#FFF', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  choiceChipOn: { borderColor: C.green, backgroundColor: C.limePale },
  choiceChipText: { color: C.muted, fontSize: 13, fontWeight: '800' },
  choiceChipTextOn: { color: C.greenDark },
  scannedActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  scannedBtnCancel: { flex: 1, padding: 18, borderRadius: 14, backgroundColor: C.bg, alignItems: 'center' },
  scannedBtnCancelText: { color: C.ink, fontWeight: '900', fontSize: 16 },
  scannedBtnRedeem: { flex: 2, padding: 18, borderRadius: 14, backgroundColor: C.green, alignItems: 'center' },
  buttonDisabled: { opacity: 0.55 },
  scannedBtnRedeemText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});

