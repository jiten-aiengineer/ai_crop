import React, { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, Image, Share } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { downloadAndShareFile } from '../../utils/downloadHelper';
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
  const [showQRModal, setShowQRModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
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
    }, [token, user])
  );

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
                <View style={{alignItems: 'center', marginVertical: 8}}>
                  <Ionicons name="qr-code-outline" size={48} color={C.green} style={{marginBottom: 12}} />
                  <Text style={{fontSize: 22, fontWeight: '900', color: C.ink, marginBottom: 6}}>Farmer Referral</Text>
                  <Text style={{fontSize: 14, color: C.muted, textAlign: 'center', paddingHorizontal: 20, marginBottom: 20}}>
                    Grow your network by inviting farmers. Earn rewards when they purchase CLSL products!
                  </Text>
                  
                  <TouchableOpacity 
                    onPress={() => setShowQRModal(true)}
                    style={{backgroundColor: C.green, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, width: '100%', justifyContent: 'center', shadowColor: C.green, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4}}
                  >
                    <Ionicons name="scan" size={20} color="#FFF" style={{marginRight: 8}} />
                    <Text style={{color: '#FFF', fontSize: 16, fontWeight: '800'}}>Show My QR & Download</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Farmer List</Text>
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

      {/* QR & Download Modal */}
      {showQRModal && referral && (
        <View style={StyleSheet.absoluteFill}>
          <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end'}}>
            <View style={{backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                <Text style={{fontSize: 20, fontWeight: '900', color: C.ink}}>Scan to Join</Text>
                <TouchableOpacity onPress={() => setShowQRModal(false)} style={{backgroundColor: C.bg, padding: 8, borderRadius: 20}}>
                  <Ionicons name="close" size={24} color={C.ink} />
                </TouchableOpacity>
              </View>
              
              <View style={{alignItems: 'center', marginBottom: 24}}>
                {referral.qr_data_url && (
                  <View style={{padding: 16, backgroundColor: '#FFF', borderRadius: 20, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset:{width:0, height:4}, marginBottom: 20}}>
                    <Image source={{uri: referral.qr_data_url}} style={{width: 200, height: 200}} />
                  </View>
                )}
                <Text style={{fontSize: 12, color: C.muted, fontWeight: '800', letterSpacing: 1.5}}>REFERRAL CODE</Text>
                <Text selectable style={{fontSize: 38, fontWeight: '900', color: C.green, letterSpacing: 5}}>{referral.referral_token || referral.token}</Text>
              </View>

              {user?.role !== 'sales_officer' ? (
                <View style={{borderTopWidth: 1, borderTopColor: C.bg, paddingTop: 20}}>
                  <Text style={{fontSize: 14, fontWeight: '800', color: C.ink, marginBottom: 12, textAlign: 'center'}}>Download Printable Poster</Text>
                  <View style={{flexDirection: 'row', gap: 12, justifyContent: 'center'}}>
                    {(() => {
                      const stateStr = user?.state?.toLowerCase() || '';
                      let stateLang = { id: 'gu', label: 'Gujarati' };
                      if (stateStr.includes('maharashtra')) {
                        stateLang = { id: 'mr', label: 'Marathi' };
                      } else if (stateStr.includes('punjab')) {
                        stateLang = { id: 'pa', label: 'Punjabi' };
                      }
                      
                      return [
                        {id: 'en', label: 'English'},
                        {id: 'hi', label: 'Hindi'},
                        stateLang
                      ].map(lang => (
                        <TouchableOpacity 
                          key={lang.id}
                          onPress={async () => {
                            const baseUrl = user?.role === 'sales_officer' ? `${API_BASE}/sales_officers` : DEALER_API;
                            const url = `${baseUrl}/me/referral/poster.pdf?token=${encodeURIComponent(token!)}&lang=${lang.id}`;
                            await downloadAndShareFile(url, `CLSL_Poster_${lang.id}.pdf`);
                          }}
                          style={{paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: C.limePale, borderWidth: 1, borderColor: '#d3e8ad', flexDirection: 'row', alignItems: 'center', gap: 6}}
                        >
                          <Ionicons name="download" size={16} color={C.greenDark} />
                          <Text style={{color: C.greenDark, fontWeight: '700', fontSize: 13}}>{lang.label}</Text>
                        </TouchableOpacity>
                      ));
                    })()}
                  </View>
                  <Text style={{fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 12}}>
                    Includes CLSL branding, your shop name, steps to install app, and your QR code.
                  </Text>
                </View>
              ) : (
                <View style={{borderTopWidth: 1, borderTopColor: C.bg, paddingTop: 20}}>
                  <TouchableOpacity 
                    onPress={async () => {
                      const code = referral.referral_token || referral.token;
                      const link = `https://ai.croplifescience.com/?ref=${code}`;
                      await Share.share({
                        message: `Join CLSL AI and unlock crop care rewards! Use my referral code: ${code}\n\nDownload and register here: ${link}`,
                      });
                    }}
                    style={{backgroundColor: C.limePale, borderWidth: 1, borderColor: '#d3e8ad', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, width: '100%', justifyContent: 'center'}}
                  >
                    <Ionicons name="share-social" size={20} color={C.greenDark} style={{marginRight: 8}} />
                    <Text style={{color: C.greenDark, fontSize: 16, fontWeight: '800'}}>Share via WhatsApp / SMS</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

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
