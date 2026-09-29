import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MobileScreen, AppColors } from '../../components/MobileScreen';

const C = {
  green: '#1a5928',
  greenDark: '#11401b',
  limePale: '#f4fce3',
  ink: '#1c221e',
  muted: '#5e6c62',
};

export default function SalesOfficerDealersScreen({ onBack }: { onBack: () => void }) {
  return (
    <MobileScreen title="Dealer Network" subtitle="Add or manage your dealers" onBack={onBack}>
      <ScrollView contentContainerStyle={styles.container}>
        
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn}>
            <View style={styles.actionIconWrap}>
              <Ionicons name="person-add" size={24} color={C.green} />
            </View>
            <Text style={styles.actionLabel}>Add New</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <View style={styles.actionIconWrap}>
              <Ionicons name="qr-code" size={24} color={C.green} />
            </View>
            <Text style={styles.actionLabel}>Gen Code</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <View style={styles.actionIconWrap}>
              <Ionicons name="list" size={24} color={C.green} />
            </View>
            <Text style={styles.actionLabel}>All Dealers</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.card}>
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12}}>
            <Ionicons name="business" size={20} color={C.green} />
            <Text style={styles.cardTitle}>Recent Activity</Text>
          </View>
          <Text style={styles.emptyText}>No recent dealer acquisitions.</Text>
          <Text style={styles.emptySubText}>Use the actions above to add a new dealer or generate an access code for an existing one.</Text>
        </View>

      </ScrollView>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, paddingHorizontal: 8 },
  actionBtn: { alignItems: 'center', flex: 1 },
  actionIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 2, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.1, shadowRadius: 4, marginBottom: 8 },
  actionLabel: { fontSize: 13, color: C.ink, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 2, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.05, shadowRadius: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.ink, marginLeft: 8 },
  emptyText: { fontSize: 15, color: C.ink, fontWeight: '500', marginBottom: 4 },
  emptySubText: { fontSize: 14, color: C.muted, lineHeight: 20 },
});
