import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MobileScreen, shared, AppColors } from '../../components/MobileScreen';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../../contexts/AuthContext';
import { DEALER_API } from '../../config/api';

export default function DealerRedeemScreen({ onBack }: { onBack: () => void }) {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Scanner state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannedData, setScannedData] = useState<any>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${DEALER_API}/me/redemptions`, { headers: { authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

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

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    setIsCameraOpen(false);
    if (!token) return;

    try {
      // Import validateCoupon at the top or use the API directly
      const response = await fetch(`${DEALER_API}/coupons/validate/${data}`, {
        headers: { authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to validate coupon.");
      }
      
      const resData = await response.json();
      
      const type = resData.campaign_name || "Discount Coupon";
      const offer = resData.discount_type === "percentage" ? `${resData.discount_value}% OFF` : `₹${resData.discount_value} OFF`;
      const criteria = resData.criteria || "No specific criteria";

      setScannedData({ code: data, type, offer, criteria });
    } catch (e: any) {
      Alert.alert("Invalid Coupon", e.message || "Failed to validate coupon.");
    }
  };

  const processRedemption = () => {
    Alert.alert(
      "Confirm Redemption",
      `Are you sure you want to redeem this ${scannedData?.type}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Yes, Redeem", 
          style: "destructive",
          onPress: async () => {
            if (!token || !scannedData) return;
            try {
              const res = await fetch(`${DEALER_API}/coupons/redeem/${scannedData.code}`, {
                method: 'POST',
                headers: { authorization: `Bearer ${token}` }
              });
              if (!res.ok) {
                  const errData = await res.json().catch(() => ({}));
                  throw new Error(errData.detail || "Failed to redeem coupon.");
              }
              Alert.alert("Success", "Redemption logged successfully.");
              setScannedData(null);
              // Refresh redemptions
              fetch(`${DEALER_API}/me/redemptions`, { headers: { authorization: `Bearer ${token}` } })
                .then(r => r.json())
                .then(d => setData(d))
                .catch(() => {});
            } catch (e: any) {
              Alert.alert("Redemption Failed", e.message || "Failed to redeem coupon.");
            }
          }
        }
      ]
    );
  };

  return (
    <MobileScreen title="Redeem & Statement" subtitle="Manage coupons and rewards" onBack={onBack}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        
        <TouchableOpacity style={styles.scanBtn} onPress={openCamera}>
          <Ionicons name="scan" size={32} color="#FFF" />
          <View style={{ marginLeft: 16 }}>
            <Text style={{ fontSize: 20, color: '#FFF', fontWeight: '800' }}>Scan Coupon / QR</Text>
            <Text style={{ fontSize: 13, color: '#CCE1EE', marginTop: 4 }}>Instantly verify and redeem farmer offers</Text>
          </View>
        </TouchableOpacity>

        <View style={shared.card}>
          <Text style={shared.sectionTitle}>Statement Summary</Text>
          {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : (
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>₹{data?.summary?.all_amount?.toFixed(0) || 0}</Text>
                <Text style={styles.statLabel}>Total Redeemed</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: AppColors.error }]}>₹{data?.summary?.outstanding_amount?.toFixed(0) || 0}</Text>
                <Text style={styles.statLabel}>Outstanding</Text>
              </View>
            </View>
          )}
        </View>

        <View style={[shared.card, { marginTop: 16 }]}>
          <Text style={shared.sectionTitle}>Recent Credit Notes</Text>
          {data?.credit_notes?.length > 0 ? data.credit_notes.map((c: any) => (
            <View key={c.id} style={styles.noteRow}>
              <View>
                <Text style={styles.noteTitle}>{c.note_number}</Text>
                <Text style={styles.noteDate}>{new Date(c.generated_at).toLocaleDateString()}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.noteAmount}>₹{c.total_amount}</Text>
                <Text style={[styles.noteStatus, c.status === 'settled' && { color: AppColors.green }]}>{c.status}</Text>
              </View>
            </View>
          )) : (
            <Text style={[shared.body, { marginTop: 12, textAlign: 'center' }]}>No credit notes generated yet.</Text>
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
              <Ionicons name="scan-outline" size={32} color={AppColors.green} />
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
              <TouchableOpacity style={styles.scannedBtnCancel} onPress={() => setScannedData(null)}><Text style={styles.scannedBtnCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.scannedBtnRedeem} onPress={processRedemption}><Text style={styles.scannedBtnRedeemText}>Redeem Offer</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  scanBtn: { backgroundColor: AppColors.blue, padding: 20, borderRadius: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16, elevation: 4, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity: 0.15, shadowRadius: 8 },
  statsRow: { flexDirection: 'row', marginTop: 16, gap: 16 },
  statBox: { flex: 1, backgroundColor: '#F8FBF3', padding: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E8EEF2' },
  statVal: { fontSize: 24, fontWeight: '900', color: AppColors.green },
  statLabel: { fontSize: 12, color: AppColors.muted, marginTop: 4, fontWeight: '700' },
  noteRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  noteTitle: { fontSize: 15, fontWeight: '700', color: AppColors.ink },
  noteDate: { fontSize: 12, color: AppColors.muted, marginTop: 4 },
  noteAmount: { fontSize: 16, fontWeight: '800', color: AppColors.ink },
  noteStatus: { fontSize: 12, color: AppColors.muted, fontWeight: '700', marginTop: 4, textTransform: 'uppercase' },
  
  // Modals
  camOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  camCloseBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 },
  camFrame: { width: 300, height: 300, borderWidth: 2, borderColor: '#fff', borderRadius: 20, overflow: 'hidden' },
  camHint: { color: '#fff', marginTop: 30, fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  scannedCard: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  scannedHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  scannedTitle: { fontSize: 22, fontWeight: '800', color: AppColors.ink },
  scannedBody: { backgroundColor: '#F8FBF3', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: AppColors.line },
  scannedLabel: { fontSize: 12, color: AppColors.muted, fontWeight: '700', textTransform: 'uppercase' },
  scannedValue: { fontSize: 18, fontWeight: '900', color: AppColors.blue, marginTop: 4 },
  scannedOffer: { fontSize: 20, fontWeight: '900', color: AppColors.green, marginTop: 4 },
  criteriaBox: { flexDirection: 'row', gap: 12, backgroundColor: '#FDF2E9', padding: 12, borderRadius: 12, marginTop: 20 },
  criteriaTitle: { fontSize: 13, fontWeight: '800', color: '#B9770E' },
  criteriaText: { fontSize: 12, color: '#935116', marginTop: 4 },
  scannedActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  scannedBtnCancel: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: '#F0F4F8', alignItems: 'center' },
  scannedBtnCancelText: { color: AppColors.ink, fontWeight: '800', fontSize: 16 },
  scannedBtnRedeem: { flex: 2, padding: 16, borderRadius: 12, backgroundColor: AppColors.green, alignItems: 'center' },
  scannedBtnRedeemText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
});
