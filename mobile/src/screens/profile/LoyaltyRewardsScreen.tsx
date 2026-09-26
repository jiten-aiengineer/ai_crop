import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, MobileScreen, shared } from '../../components/MobileScreen';
import QRCode from 'react-native-qrcode-svg';

export default function LoyaltyRewardsScreen({ onBack }: { onBack: () => void }) {
  // Mock points for demonstration
  const [points, setPoints] = useState(1250);
  const [claimedProduct, setClaimedProduct] = useState<string | null>(null);

  const rewards = [
    { id: '1', title: 'CLSL Meso Power (250ml)', points: 1000, description: 'Free 250ml pack of Meso Power' },
    { id: '2', title: 'CLSL Zyme (1L)', points: 2500, description: 'Free 1 Litre pack of Zyme' },
    { id: '3', title: 'Agri Spray Pump', points: 5000, description: '15L manual backpack sprayer' },
  ];

  return (
    <MobileScreen title="Loyalty Program" subtitle="Earn & Redeem" onBack={onBack}>
      <View style={styles.balanceCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.balanceLabel}>Your Reward Points</Text>
          <Text style={styles.balanceValue}>{points} <Text style={{fontSize: 16, fontWeight: '700'}}>pts</Text></Text>
        </View>
        <View style={styles.star}>
          <Ionicons name="star" size={32} color="#F5B041" />
        </View>
      </View>

      <Text style={[shared.sectionTitle, { marginTop: 16, marginBottom: 8 }]}>Available Rewards</Text>
      
      {rewards.map(r => {
        const canClaim = points >= r.points;
        return (
          <View key={r.id} style={styles.rewardCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardTitle}>{r.title}</Text>
              <Text style={styles.rewardDesc}>{r.description}</Text>
              <Text style={[styles.reqPoints, !canClaim && { color: AppColors.error }]}>
                {r.points} points required
              </Text>
            </View>
            <TouchableOpacity 
              style={[styles.claimBtn, !canClaim && styles.claimBtnDisabled]}
              disabled={!canClaim}
              onPress={() => setClaimedProduct(r.id)}
            >
              <Text style={[styles.claimBtnText, !canClaim && { color: AppColors.muted }]}>
                {canClaim ? 'Claim' : 'Locked'}
              </Text>
              {!canClaim && <Ionicons name="lock-closed" size={14} color={AppColors.muted} style={{marginLeft: 4}} />}
            </TouchableOpacity>
          </View>
        );
      })}

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={20} color={AppColors.blue} />
        <Text style={styles.infoText}>
          Show the claimed QR code to your local dealer to redeem your free product. Points are awarded based on app activity and purchases.
        </Text>
      </View>

      {/* Claimed QR Modal */}
      <Modal visible={!!claimedProduct} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reward Ready!</Text>
            <Text style={styles.modalSub}>Show this code to your dealer.</Text>
            
            <View style={styles.qrBox}>
              <QRCode value={`REWARD-${claimedProduct}-${Date.now()}`} size={180} />
            </View>
            
            <Text style={styles.qrCodeText}>REWARD-{claimedProduct}-{Date.now().toString().slice(-4)}</Text>

            <TouchableOpacity style={shared.primary} onPress={() => {
              setPoints(points - (rewards.find(x => x.id === claimedProduct)?.points || 0));
              setClaimedProduct(null);
            }}>
              <Text style={shared.primaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  balanceCard: { backgroundColor: '#FFF9E6', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#FDEBD0' },
  balanceLabel: { color: '#B9770E', fontWeight: '700', fontSize: 13 },
  balanceValue: { color: '#935116', fontSize: 36, fontWeight: '900', marginTop: 4 },
  star: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FEF5E7', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FAD7A1' },
  
  rewardCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: AppColors.line },
  rewardTitle: { fontSize: 16, fontWeight: '800', color: AppColors.ink },
  rewardDesc: { fontSize: 13, color: AppColors.textSub, marginTop: 4, paddingRight: 10 },
  reqPoints: { fontSize: 12, fontWeight: '700', color: AppColors.green, marginTop: 8 },
  
  claimBtn: { backgroundColor: AppColors.greenLight, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  claimBtnDisabled: { backgroundColor: AppColors.bg },
  claimBtnText: { color: AppColors.green, fontWeight: '800' },

  infoBox: { flexDirection: 'row', backgroundColor: '#EBF5FB', padding: 16, borderRadius: 12, gap: 10, marginTop: 20 },
  infoText: { flex: 1, color: '#2874A6', fontSize: 13, lineHeight: 18 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 24, alignItems: 'center' },
  modalTitle: { fontSize: 22, fontWeight: '900', color: AppColors.ink },
  modalSub: { color: AppColors.muted, marginTop: 4, marginBottom: 24 },
  qrBox: { padding: 16, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: AppColors.line, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  qrCodeText: { marginTop: 16, marginBottom: 24, fontSize: 16, fontWeight: '800', color: AppColors.blue, letterSpacing: 1.5 }
});
