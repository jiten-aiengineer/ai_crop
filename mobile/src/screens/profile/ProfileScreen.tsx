import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View, Modal, ScrollView, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { AppColors, MobileScreen, shared } from '../../components/MobileScreen';
import mascotImage from '../../../assets/images/mascot_new.png';

export default function ProfileScreen({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { user, logout } = useAuth();
  const [showTerms, setShowTerms] = useState(false);

  return (
    <MobileScreen title="My Profile" subtitle="Account and preferences">
      <View style={styles.identity}>
        <Image source={mascotImage} style={styles.avatar} />
        <Text style={styles.name}>{user?.first_name} {user?.last_name || ''}</Text>
        <Text style={styles.mobile}>{user?.mobile_number}</Text>
        <View style={styles.role}>
          <Text style={styles.roleText}>{(user?.role || 'general_user').replace('_', ' ')}</Text>
        </View>
      </View>
      
      <View style={shared.card}>
        <Text style={shared.sectionTitle}>Farmer Dashboard</Text>
        <TouchableOpacity onPress={() => onNavigate?.('history')} style={styles.row}>
          <View style={styles.icon}>
            <Ionicons name="leaf-outline" size={20} color={AppColors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Inspections</Text>
            <Text style={styles.rowValue}>Crop History</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A5B1" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onNavigate?.('rewards')} style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={styles.icon}>
            <Ionicons name="star-outline" size={20} color="#F5B041" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Loyalty Points</Text>
            <Text style={styles.rowValue}>Rewards Program</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A5B1" />
        </TouchableOpacity>
      </View>

      <View style={shared.card}>
        <Text style={shared.sectionTitle}>Settings</Text>
        <Row icon="location-outline" label="District" value={user?.district || 'Saved securely'} />
        <Row icon="language-outline" label="Language" value={(user?.preferred_language || 'en').toUpperCase()} />
        <TouchableOpacity onPress={() => setShowTerms(true)} style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={styles.icon}>
            <Ionicons name="document-text-outline" size={20} color={AppColors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Legal</Text>
            <Text style={styles.rowValue}>Terms & Conditions</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A5B1" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Ionicons name="log-out-outline" size={21} color="#B3261E" />
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
      <Text style={styles.version}>CLSL AI · Crop care, made smarter</Text>

      {/* Terms Modal */}
      <Modal visible={showTerms} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Terms & Conditions</Text>
            <TouchableOpacity onPress={() => setShowTerms(false)}>
              <Ionicons name="close-circle" size={32} color={AppColors.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.termsContent}>
            <Text style={styles.termsBody}>
              Welcome to Crop Life Science Limited (CLSL) AI App. By using this application, you agree to the following terms:{'\n\n'}
              1. **Usage**: This application is provided for informational purposes only. The crop disease predictions, weather advisory, and spray calculations are algorithmic estimates and should not replace professional agricultural consultation.{'\n\n'}
              2. **Privacy & Data**: We value your privacy. We collect basic profile data (name, mobile) and approximate location to provide localized weather and nearest dealer mapping. We do not sell your personal data to third parties.{'\n\n'}
              3. **Promotions**: Farmers who opt-in may receive SMS or WhatsApp notifications containing rewards, promotional offers, and localized weather alerts. You can opt-out by contacting our support hotline.{'\n\n'}
              4. **Liability**: CLSL is not liable for any crop damage, financial loss, or incorrect product application resulting from the use of the tools in this app. Always read the printed label on the physical product before application.{'\n\n'}
              5. **Rewards**: Coupon codes are subject to verification by the local dealer. CLSL reserves the right to withdraw or modify promotional campaigns without prior notice.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </MobileScreen>
  );
}

function Row({ icon, label, value, last }: { icon: 'location-outline' | 'language-outline' | 'shield-checkmark-outline' | 'leaf-outline'; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={20} color={AppColors.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94A5B1" />
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { ...shared.card, alignItems: 'center', paddingVertical: 25 },
  avatar: { width: 82, height: 82, borderRadius: 25 },
  name: { fontSize: 23, fontWeight: '900', color: AppColors.ink, marginTop: 12 },
  mobile: { color: AppColors.muted, marginTop: 3 },
  role: { backgroundColor: AppColors.pale, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6, marginTop: 12 },
  roleText: { color: AppColors.blue, fontWeight: '800', textTransform: 'capitalize' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E8EEF2' },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: AppColors.pale, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 12, color: AppColors.muted },
  rowValue: { fontSize: 15, color: AppColors.ink, fontWeight: '800', marginTop: 2 },
  logout: { height: 54, borderRadius: 16, borderWidth: 1, borderColor: '#F0C9C6', backgroundColor: '#FFF5F4', flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: '#B3261E', fontWeight: '900', fontSize: 16 },
  version: { textAlign: 'center', color: '#8294A0', fontSize: 12, marginTop: 4 },

  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: AppColors.lineLight },
  modalTitle: { fontSize: 20, fontWeight: '900', color: AppColors.ink },
  termsContent: { padding: 20 },
  termsBody: { fontSize: 14, lineHeight: 24, color: AppColors.textSub }
});
