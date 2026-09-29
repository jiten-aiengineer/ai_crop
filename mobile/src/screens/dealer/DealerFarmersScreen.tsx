import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MobileScreen, shared, AppColors } from '../../components/MobileScreen';
import { useAuth } from '../../contexts/AuthContext';
import { getDealerDashboard, getDealerFarmers, getDealerReferral, getSalesOfficerReferral, getSalesOfficerFarmers } from '../../services/api';
import { DEALER_API, API_BASE } from '../../config/api';

const C = {
  green: '#1a5928',
  greenDark: '#11401b',
  lime: '#cbe968',
  limePale: '#f4fce3',
  bg: '#f2f6ed',
  white: '#ffffff',
  ink: '#1c221e',
  muted: '#5e6c62',
  amber: '#d97706',
};

export default function DealerFarmersScreen({ onBack }: { onBack: () => void }) {
  const { token, user } = useAuth();
  const [dashboard, setDashboard] = useState<any>(null);
  const [farmers, setFarmers] = useState<any[]>([]);
  const [referral, setReferral] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !user) return;
    
    if (user.role === 'sales_officer') {
      Promise.all([
        getSalesOfficerFarmers(token),
        getSalesOfficerReferral(token)
      ]).then(([famRes, refRes]) => {
        setFarmers(famRes.farmers || []);
        setReferral(refRes);
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      Promise.all([
        getDealerDashboard(token),
        getDealerFarmers(token),
        getDealerReferral(token)
      ]).then(([dashRes, famRes, refRes]) => {
        setDashboard(dashRes);
        setFarmers(famRes.items || []);
        setReferral(refRes);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [token, user]);

  return (
    <MobileScreen title="Referred Farmers" subtitle="Your connected network" onBack={onBack}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        
        {loading ? <ActivityIndicator style={{ marginTop: 20 }} color={C.green} /> : (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{dashboard?.targets?.total_referrals || 0}</Text>
                <Text style={styles.statLabel}>Total Farmers</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: C.amber }]}>{dashboard?.targets?.monthly_referrals || 0}</Text>
                <Text style={styles.statLabel}>This Month</Text>
              </View>
            </View>

            {referral && (
              <View style={styles.card}>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionTitle}>Your Referral Code</Text>
                  <TouchableOpacity onPress={() => { 
                    const baseUrl = user?.role === 'sales_officer' ? `${API_BASE}/sales_officers` : DEALER_API;
                    Linking.openURL(`${baseUrl}/me/referral/poster.pdf?token=${encodeURIComponent(token!)}`); 
                  }} style={[styles.refreshBtn, {backgroundColor: C.limePale}]}>
                    <Ionicons name="download-outline" size={18} color={C.greenDark}/>
                  </TouchableOpacity>
                </View>
                <View style={{alignItems: 'center', marginVertical: 16}}>
                  {referral.qr_data_url && (
                    <Image source={{uri: referral.qr_data_url}} style={{width: 160, height: 160, marginBottom: 16}} />
                  )}
                  <Text style={{fontSize: 32, fontWeight: '900', color: C.amber, letterSpacing: 4}}>{referral.referral_token || referral.token}</Text>
                  <Text style={{fontSize: 14, color: C.muted, marginTop: 8, textAlign: 'center'}}>Show this code to farmers or download the QR poster to paste on your shop wall.</Text>
                </View>
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Network List</Text>
              </View>
              
              {farmers.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="people-circle-outline" size={64} color="#D0E3F0" />
                  <Text style={{ fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 16 }}>
                    No farmers referred yet.
                  </Text>
                </View>
              ) : (
                <View style={{gap: 12}}>
                  {farmers.map(f => (
                    <View key={f.id} style={styles.farmerItem}>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
                        <View style={styles.farmerIcon}>
                          <Ionicons name="person" size={20} color={C.green} />
                        </View>
                        <View>
                          <Text style={styles.farmerName}>{f.name}</Text>
                          <Text style={styles.farmerPhone}>{f.phone}</Text>
                        </View>
                      </View>
                      <View style={{alignItems: 'flex-end'}}>
                        {f.joined_at && <Text style={styles.farmerDate}>{new Date(f.joined_at).toLocaleDateString()}</Text>}
                        {f.district && <Text style={styles.farmerLoc}>{f.district}</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: C.white, padding: 20, borderRadius: 16, alignItems: 'center', shadowColor: C.greenDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  statVal: { fontSize: 32, fontWeight: '900', color: C.green },
  statLabel: { fontSize: 13, color: C.muted, marginTop: 4, fontWeight: '700', textTransform: 'uppercase' },
  
  card: { backgroundColor: C.white, borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: C.greenDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: C.ink },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eaf2e3', alignItems: 'center', justifyContent: 'center' },
  
  farmerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  farmerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.limePale, alignItems: 'center', justifyContent: 'center' },
  farmerName: { fontSize: 16, fontWeight: '700', color: C.ink },
  farmerPhone: { fontSize: 13, color: C.muted, marginTop: 2 },
  farmerDate: { fontSize: 12, fontWeight: '600', color: C.green },
  farmerLoc: { fontSize: 12, color: C.muted, marginTop: 2 },
});
