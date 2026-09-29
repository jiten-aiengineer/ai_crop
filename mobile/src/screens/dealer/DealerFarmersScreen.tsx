import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MobileScreen, shared, AppColors } from '../../components/MobileScreen';
import { useAuth } from '../../contexts/AuthContext';
import { getDealerDashboard } from '../../services/api';

export default function DealerFarmersScreen({ onBack }: { onBack: () => void }) {
  const { token, user } = useAuth();
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    getDealerDashboard(token)
      .then(d => { setDashboard(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  return (
    <MobileScreen title="Referred Farmers" subtitle="Your connected network" onBack={onBack}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        
        {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{dashboard?.targets?.total_referrals || 0}</Text>
                <Text style={styles.statLabel}>Total Farmers</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: AppColors.blue }]}>{dashboard?.targets?.monthly_referrals || 0}</Text>
                <Text style={styles.statLabel}>This Month</Text>
              </View>
            </View>

            <View style={[shared.card, { marginTop: 16, alignItems: 'center', paddingVertical: 40 }]}>
              <Ionicons name="people-circle-outline" size={64} color="#D0E3F0" />
              <Text style={{ fontSize: 18, fontWeight: '800', color: AppColors.ink, marginTop: 16 }}>Network List</Text>
              <Text style={{ fontSize: 14, color: AppColors.muted, textAlign: 'center', marginTop: 8, paddingHorizontal: 20 }}>
                A detailed list of your referred farmers is being synced. Please check back later or use the CLSL AI web portal to view complete details.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 16 },
  statBox: { flex: 1, backgroundColor: '#F8FBF3', padding: 24, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E8EEF2' },
  statVal: { fontSize: 32, fontWeight: '900', color: AppColors.green },
  statLabel: { fontSize: 14, color: AppColors.muted, marginTop: 4, fontWeight: '700' },
});
