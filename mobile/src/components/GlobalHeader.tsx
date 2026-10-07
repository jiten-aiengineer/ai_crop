import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = { ink: '#0B1015', cardBorder: '#E5E7EB', cardBorderAlt: '#F3F4F6', surfaceAlt: '#F7F9FC', green: '#3e7025', muted: '#71806d' };

type Props = {
  onNavigate?: (screen: string) => void;
  onBack?: () => void;
  tagline?: string;
};

export default function GlobalHeader({ onNavigate, onBack, tagline }: Props) {
  const [showNotifications, setShowNotifications] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.topBar, { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 8 : 12) + 8 }]}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={s.topBarHeader}>
        <View style={s.topBarLeft}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={{ marginRight: 10, padding: 4 }}>
              <Ionicons name="arrow-back" size={24} color={C.ink} />
            </TouchableOpacity>
          )}
          <Image
            source={require('../../assets/images/clsl-logo-leaf.png')}
            style={s.topBarLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={s.topBarBrand}>CLSL</Text>
            <Text style={s.topBarTagline}>{tagline || 'Crop care, made smarter.'}</Text>
          </View>
        </View>
        <View style={s.topBarRight}>
          <View style={s.weatherPill}>
            <Text style={s.weatherText}>28°C</Text>
            <Ionicons name="partly-sunny" size={14} color={C.green} />
          </View>
          <TouchableOpacity style={s.topBarBtn} onPress={() => setShowNotifications(!showNotifications)}>
            <Ionicons name="notifications-outline" size={20} color={C.ink} />
            <View style={s.notifDot} />
          </TouchableOpacity>
        </View>
      </View>

      {showNotifications && (
        <View style={s.notifDropdown}>
          <View style={s.notifHeader}>
            <Text style={s.notifTitle}>Notifications</Text>
            <TouchableOpacity onPress={() => setShowNotifications(false)}>
              <Ionicons name="close" size={16} color={C.muted} />
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={s.notifItem} onPress={() => { setShowNotifications(false); onNavigate?.('coupons'); }}>
            <Text style={s.notifItemTitle}>New Coupon Added! 🎁</Text>
            <Text style={s.notifItemBody}>You unlocked 10% off on your next purchase.</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={s.notifItem} onPress={() => { setShowNotifications(false); onNavigate?.('products'); }}>
            <Text style={s.notifItemTitle}>New CLSL Product 🚀</Text>
            <Text style={s.notifItemBody}>AMBUCROP is now available for your apple crops.</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={[s.notifItem, { borderBottomWidth: 0 }]} onPress={() => { setShowNotifications(false); onNavigate?.('assistant'); }}>
            <Text style={[s.notifItemTitle, { color: '#e11d48' }]}>Weather Advisory ⚠️</Text>
            <Text style={s.notifItemBody}>High humidity detected. Increased risk of blight.</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  topBar: { paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 8 : 12, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', zIndex: 50 },
  topBarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topBarLeft: { flexDirection: 'row', alignItems: 'center' },
  topBarLogo: { width: 34, height: 34, marginRight: 10 },
  topBarBrand: { fontSize: 16, fontWeight: '900', color: '#0f2613', letterSpacing: 0.5 },
  topBarTagline: { fontSize: 11, color: '#32593d', fontWeight: '500', marginTop: -1 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  weatherPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20 },
  weatherText: { color: C.ink, fontSize: 12, fontWeight: '800', marginRight: 4 },
  topBarBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', position: 'relative' },
  notifDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: '#e11d48', borderWidth: 1, borderColor: '#fff' },
  
  notifDropdown: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 60, right: 16, backgroundColor: '#fff', borderRadius: 16, width: 280, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 10, zIndex: 100, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
  notifTitle: { fontSize: 14, fontWeight: '800', color: C.ink },
  notifItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  notifItemTitle: { fontSize: 12, fontWeight: '700', color: C.ink },
  notifItemBody: { fontSize: 11, color: '#4b5563', marginTop: 2 },
});
