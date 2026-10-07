/**
 * SalesOfficerHomeScreen — Premium dashboard for CLSL Sales Officers
 * Matches the design quality of HomeScreen (farmer) but tailored for SO.
 * 
 * Features:
 *  - Greeting + referral share card
 *  - Quick actions: AI Crop Doctor, Products, My Coupons, Spray Calc, Ask Dr. CLSL
 *  - Featured products strip
 *  - Daily insights (with rewards hints)
 *  - Weather strip
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Image, Dimensions, Platform, ActivityIndicator,
  FlatList, Modal, Share, Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import GlobalHeader from '../../components/GlobalHeader';
import { useAuth } from '../../contexts/AuthContext';
import { getCatalogue, getHomeStats, CatalogProduct } from '../../services/api';
import { FARMING_FACTS, FarmingFact } from '../../constants/FarmingFacts';

const { width: W } = Dimensions.get('window');
const H_PAD = 16;
const CARD_GAP = 12;
const CARD_W = (W - H_PAD * 2 - CARD_GAP) / 2;
const PRODUCT_CARD_W = W * 0.46;

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
  blue:       '#1d4ed8',
  bluePale:   '#dbeafe',
};

const CAT_COLOR: Record<string, { bg: string; color: string }> = {
  'Insecticides':             { bg: '#fff3cd', color: '#856404' },
  'Fungicides':               { bg: C.limePale, color: C.green },
  'Weedicides':               { bg: '#d1ecf1', color: '#0c5460' },
  'Herbicides':               { bg: '#d1ecf1', color: '#0c5460' },
  'Seed Treatment':           { bg: '#e2d9f3', color: '#4a1d8c' },
  'Plant Growth Regulator':   { bg: C.tealPale, color: C.teal },
  'Bio Stimulant':            { bg: '#d4edda', color: '#155724' },
  'Micro Fertilizers':        { bg: '#cce5ff', color: '#004085' },
};
const getCatStyle = (cat: string) => CAT_COLOR[cat] || { bg: C.limePale, color: C.green };

const SO_QUICK_ACTIONS = [
  { id: 'inspect',    icon: 'leaf',                       lib: 'mci', color: C.green,  bg: C.limePale,  label: 'AI Crop Doctor', sub: 'Identify problems'    },
  { id: 'coupons',   icon: 'tag-outline',                lib: 'mci', color: C.red,    bg: C.redPale,   label: 'View Coupons',   sub: 'All active coupons'   },
  { id: 'calculator',icon: 'calculator-variant-outline', lib: 'mci', color: C.teal,   bg: C.tealPale,  label: 'Spray Calc',     sub: 'Get right dosage'     },
  { id: 'assistant', icon: 'chat-processing-outline',    lib: 'mci', color: C.purple, bg: C.purplePale,label: 'Ask Dr. CLSL',      sub: 'Your farming friend'  },
] as const;

type QuickAction = typeof SO_QUICK_ACTIONS[number];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function productImageUrl(img: string): string {
  if (!img) return '';
  if (img.startsWith('http')) return img;
  if (img.startsWith('/')) return `https://ai.croplifescience.com${img}`;
  return '';
}

export default function SalesOfficerHomeScreen({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { user } = useAuth();
  const [stats, setStats] = useState({ productCount: 73, cropCount: 25 });
  const [featured, setFeatured] = useState<CatalogProduct[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const flatListRef = useRef<FlatList>(null);
  const [facts, setFacts] = useState<FarmingFact[]>([]);
  const [currentFactIndex, setCurrentFactIndex] = useState(0);
  const scrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedFact, setSelectedFact] = useState<FarmingFact | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showReferral, setShowReferral] = useState(false);

  // Referral code (for SO, use employee referral if available)
  const referralCode = (user as any)?.referral_code || (user as any)?.employee_code || 'CLSL-SO';

  useEffect(() => {
    const shuffled = [...FARMING_FACTS].sort(() => 0.5 - Math.random());
    setFacts(shuffled.slice(0, 10));
  }, []);

  useEffect(() => {
    if (facts.length === 0) return;
    scrollTimerRef.current = setInterval(() => {
      let nextIndex = currentFactIndex + 1;
      if (nextIndex >= facts.length) nextIndex = 0;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      setCurrentFactIndex(nextIndex);
    }, 6000);
    return () => { if (scrollTimerRef.current) clearInterval(scrollTimerRef.current); };
  }, [currentFactIndex, facts.length]);

  useEffect(() => {
    let mounted = true;
    Promise.all([getHomeStats(), getCatalogue()])
      .then(([s, cat]) => {
        if (!mounted) return;
        setStats({ productCount: s.productCount, cropCount: s.cropCount });
        setFeatured((cat.items || []).slice(0, 8));
      })
      .catch(() => {})
      .finally(() => { if (mounted) setStatsLoading(false); });
    return () => { mounted = false; };
  }, []);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Hi! I'm ${user?.first_name} from CLSL. Use my referral code ${referralCode} on the CLSL AI app to get exclusive coupons on crop protection products! 🌱`,
        title: 'CLSL Referral Code',
      });
    } catch {
      Alert.alert('Share Error', 'Could not open share sheet.');
    }
  };

  const renderIcon = (action: QuickAction) =>
    action.lib === 'mci'
      ? <MaterialCommunityIcons name={action.icon as any} size={28} color={action.color} />
      : <Ionicons name={action.icon as any} size={28} color={action.color} />;

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <GlobalHeader tagline="Sales Officer Portal" />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero banner ──────────────────────────────────────────── */}
        <TouchableOpacity style={s.heroBanner} onPress={() => onNavigate?.('inspect')} activeOpacity={0.9}>
          <LinearGradient colors={['#1d4ed8', '#1e3a8a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroGrad}>
            <View style={s.heroBubble1} />
            <View style={s.heroBubble2} />
            <View style={s.heroContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                <View style={s.heroBadge}>
                  <Ionicons name="shield-checkmark" size={10} color="#93c5fd" />
                  <Text style={s.heroBadgeText}>SALES OFFICER</Text>
                </View>
                {user?.district && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999 }}>
                    <Ionicons name="location-outline" size={10} color="#93c5fd" />
                    <Text style={{ fontSize: 8.5, color: '#fff', marginLeft: 2, fontWeight: '700' }}>{user.district}</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 11, color: '#93c5fd', fontWeight: '700', marginBottom: 2 }}>{greeting()}, {user?.first_name || 'Officer'} 👋</Text>
              <Text style={s.heroTitle}>Empower farmers{'\\n'}with smart tools</Text>
              <Text style={s.heroBody}>Scan crops, share coupons & grow together.</Text>
              <View style={s.heroBtn}>
                <Ionicons name="scan" size={14} color="#1d4ed8" />
                <Text style={[s.heroBtnText, { color: '#1d4ed8' }]}>Scan a crop</Text>
              </View>
            </View>
            <Image source={require('../../../assets/images/mascot_v3.png')} style={{ position: 'absolute', right: 5, bottom: -5, width: 130, height: 130, aspectRatio: 1 }} resizeMode="contain" />
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Referral Share Card ──────────────────────────────────── */}
        <TouchableOpacity style={s.referralCard} onPress={() => setShowReferral(true)} activeOpacity={0.85}>
          <LinearGradient colors={[C.greenDark, C.greenMid]} style={s.referralGrad}>
            <View style={s.referralLeft}>
              <Text style={s.referralLabel}>MY REFERRAL CODE</Text>
              <Text style={s.referralCode}>{referralCode}</Text>
              <Text style={s.referralHint}>Share with farmers to give them exclusive coupons</Text>
            </View>
            <View style={s.referralRight}>
              <View style={s.referralIconBox}>
                <Ionicons name="share-social" size={22} color={C.lime} />
              </View>
              <Text style={s.referralShareText}>Share</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Featured products ─────────────────────────────────────── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Product Catalogue</Text>
          <TouchableOpacity onPress={() => onNavigate?.('products')}>
            <Text style={s.seeAll}>See all {stats.productCount}+ →</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.productStrip}>
          {featured.length === 0
            ? [0, 1, 2].map(i => <View key={i} style={[s.productCard, s.productCardSkeleton]} />)
            : featured.map(product => {
                const catStyle = getCatStyle(product.category);
                const imgUrl = productImageUrl(product.image);
                return (
                  <TouchableOpacity key={product.id} style={s.productCard} onPress={() => onNavigate?.('products')} activeOpacity={0.82}>
                    <View style={s.productImgBox}>
                      {imgUrl ? (
                        <Image source={{ uri: imgUrl }} style={s.productImg} resizeMode="contain" />
                      ) : (
                        <MaterialCommunityIcons name="bottle-tonic-outline" size={36} color={C.green} />
                      )}
                    </View>
                    <View style={[s.catPill, { backgroundColor: catStyle.bg }]}>
                      <Text style={[s.catPillText, { color: catStyle.color }]} numberOfLines={1}>{product.category}</Text>
                    </View>
                    <Text style={s.productName} numberOfLines={2}>{product.name}</Text>
                    <Text style={s.productCommon} numberOfLines={1}>{product.commonName}</Text>
                  </TouchableOpacity>
                );
              })}
        </ScrollView>

        {/* ── Quick actions ─────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.quickGrid}>
          {SO_QUICK_ACTIONS.map(action => (
            <TouchableOpacity key={action.id} style={s.quickCard} onPress={() => onNavigate?.(action.id)} activeOpacity={0.76}>
              <View style={s.quickTop}>
                <View style={[s.quickIconBox, { backgroundColor: action.bg }]}>
                  {renderIcon(action)}
                </View>
                <Ionicons name="arrow-forward-circle-outline" size={18} color={action.color} />
              </View>
              <Text style={s.quickLabel}>{action.label}</Text>
              <Text style={s.quickSub}>{action.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Daily Insights ─────────────────────────────────────────── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Daily Insights</Text>
        </View>

        <View style={{ marginHorizontal: -H_PAD, marginBottom: 20 }}>
          <FlatList
            ref={flatListRef}
            data={facts}
            keyExtractor={item => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / W);
              setCurrentFactIndex(index);
            }}
            renderItem={({ item }) => {
              let bg = C.card; let border = C.line;
              let icon = 'bulb-outline'; let iconColor = C.amber; let iconBg = C.amberPale;
              if (item.type === 'offer') { bg = '#faf5ff'; border = '#e9d5ff'; icon = 'gift-outline'; iconColor = '#9333ea'; iconBg = '#f3e8ff'; }
              else if (item.type === 'clsl') { bg = '#f2fdf5'; border = '#bbf7d0'; icon = 'leaf-outline'; iconColor = '#16a34a'; iconBg = '#dcfce7'; }
              else if (item.type === 'tip') { bg = '#f0f9ff'; border = '#bae6fd'; icon = 'water-outline'; iconColor = '#0369a1'; iconBg = '#e0f2fe'; }
              return (
                <View style={{ width: W, paddingHorizontal: H_PAD }}>
                  <TouchableOpacity
                    style={[s.advisoryCard, { backgroundColor: bg, borderColor: border, marginBottom: 0, minHeight: 120 }]}
                    activeOpacity={0.85}
                    onPress={() => setSelectedFact(item)}
                  >
                    <View style={[s.advisoryIconBox, { backgroundColor: iconBg }]}>
                      <Ionicons name={icon as any} size={18} color={iconColor} />
                    </View>
                    <View style={s.advisoryBody}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: iconColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {item.type === 'clsl' ? 'CLSL Insight' : item.type.toUpperCase()}
                      </Text>
                      <Text style={[s.advisoryTitle, { color: iconColor }]} numberOfLines={1}>{item.title}</Text>
                      <Text style={[s.advisoryText, { color: '#374151' }]} numberOfLines={2}>{item.text}</Text>
                      <View style={s.advisoryActionRow}>
                        <Text style={[s.advisoryLink, { color: iconColor }]}>Read full insight</Text>
                        <Ionicons name="arrow-forward" size={12} color={iconColor} />
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        </View>

        {/* ── Weather strip ─────────────────────────────────────────── */}
        <TouchableOpacity style={s.weatherStrip} onPress={() => onNavigate?.('weather')} activeOpacity={0.8}>
          <View style={s.weatherIconBox}>
            <Ionicons name="partly-sunny" size={24} color={C.amber} />
          </View>
          <View style={s.weatherCenter}>
            <Text style={s.weatherTemp}>28°C <Text style={s.weatherCond}>· Partly cloudy</Text></Text>
            <Text style={s.weatherHint}>Good spraying window until 11:30 AM</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.muted} />
        </TouchableOpacity>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── Daily Insight Modal ─────────────────────────────────────── */}
      <Modal visible={!!selectedFact} transparent animationType="fade" onRequestClose={() => setSelectedFact(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <TouchableOpacity onPress={() => setSelectedFact(null)} style={s.modalClose}>
              <Ionicons name="close" size={24} color={C.muted} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>{selectedFact?.title}</Text>
            <Text style={s.modalText}>{selectedFact?.text}</Text>
            {selectedFact?.actionText && (
              <TouchableOpacity style={s.modalActionBtn} onPress={() => { const route = selectedFact.actionRoute; setSelectedFact(null); if (route) onNavigate?.(route); }}>
                <Text style={s.modalActionText}>{selectedFact.actionText}</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Referral Share Modal ────────────────────────────────────── */}
      <Modal visible={showReferral} transparent animationType="slide" onRequestClose={() => setShowReferral(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <TouchableOpacity onPress={() => setShowReferral(false)} style={s.modalClose}>
              <Ionicons name="close" size={24} color={C.muted} />
            </TouchableOpacity>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.limePale, justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="share-social" size={28} color={C.green} />
              </View>
              <Text style={s.modalTitle}>My Referral Code</Text>
              <View style={{ backgroundColor: C.limePale, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8, borderWidth: 2, borderColor: C.line, borderStyle: 'dashed' }}>
                <Text style={{ fontSize: 28, fontWeight: '900', color: C.green, letterSpacing: 4 }}>{referralCode}</Text>
              </View>
              <Text style={[s.modalText, { textAlign: 'center', marginTop: 12 }]}>
                Share this code with farmers. When they register using your code, they get exclusive CLSL coupons — and you help grow the CLSL network!
              </Text>
            </View>
            <TouchableOpacity style={s.modalActionBtn} onPress={handleShare}>
              <Ionicons name="share-social" size={18} color="#fff" />
              <Text style={s.modalActionText}>Share Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 48 : 34, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  topBarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topBarLogo: { width: 34, height: 34, borderRadius: 8 },
  topBarBrand: { fontSize: 16, fontWeight: '900', color: '#0B4783', letterSpacing: -0.3 },
  topBarTagline: { fontSize: 10, color: '#0B4783', marginTop: 1 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  topBarBtn: { position: 'relative', padding: 4 },
  notifDot: { position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: 4, backgroundColor: C.lime, borderWidth: 1.5, borderColor: C.greenDark },

  scroll: { paddingHorizontal: H_PAD, paddingTop: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: C.ink, letterSpacing: -0.3, marginBottom: 12 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAll: { fontSize: 12, fontWeight: '700', color: C.green },

  heroBanner: { borderRadius: 18, overflow: 'hidden', marginBottom: 16, shadowColor: '#1d4ed8', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 6 },
  heroGrad: { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 16, paddingTop: 18, paddingBottom: 0, minHeight: 120, overflow: 'hidden' },
  heroBubble1: { position: 'absolute', top: -50, right: -40, width: 140, height: 140, borderRadius: 70, borderWidth: 30, borderColor: 'rgba(147,197,253,0.13)' },
  heroBubble2: { position: 'absolute', bottom: 20, left: -30, width: 80, height: 80, borderRadius: 40, borderWidth: 16, borderColor: 'rgba(255,255,255,0.08)' },
  heroContent: { width: W * 0.54, paddingBottom: 16 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(147,197,253,0.2)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start', marginBottom: 8 },
  heroBadgeText: { fontSize: 8, fontWeight: '800', color: '#93c5fd', letterSpacing: 1 },
  heroTitle: { fontSize: 17, fontWeight: '900', color: '#fff', lineHeight: 22, letterSpacing: -0.4, marginBottom: 6 },
  heroBody: { fontSize: 10, color: 'rgba(255,255,255,0.8)', lineHeight: 14, marginBottom: 12 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#93c5fd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  heroBtnText: { fontSize: 11, fontWeight: '800' },

  // Referral card
  referralCard: { borderRadius: 16, overflow: 'hidden', marginBottom: 24, shadowColor: C.greenDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 },
  referralGrad: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  referralLeft: { flex: 1 },
  referralLabel: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
  referralCode: { fontSize: 22, fontWeight: '900', color: C.lime, letterSpacing: 3, marginBottom: 4 },
  referralHint: { fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 15 },
  referralRight: { alignItems: 'center', gap: 4 },
  referralIconBox: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(203,233,104,0.15)', justifyContent: 'center', alignItems: 'center' },
  referralShareText: { fontSize: 11, fontWeight: '800', color: C.lime },

  // Quick actions
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, marginBottom: 24 },
  quickCard: { width: CARD_W, backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.line, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, minHeight: 110 },
  quickTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  quickIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  quickLabel: { fontSize: 13, fontWeight: '900', color: C.ink, marginBottom: 2 },
  quickSub: { fontSize: 11, color: C.muted, fontWeight: '500', lineHeight: 14 },

  // Products
  productStrip: { paddingRight: H_PAD, paddingBottom: 6, gap: 12, marginBottom: 24 },
  productCard: { width: PRODUCT_CARD_W, backgroundColor: C.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.line, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  productCardSkeleton: { height: 180, opacity: 0.4, backgroundColor: C.line },
  productImgBox: { width: '100%', height: 90, backgroundColor: C.bg, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8, overflow: 'hidden' },
  productImg: { width: '100%', height: '100%' },
  catPill: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6 },
  catPillText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.3 },
  productName: { fontSize: 12, fontWeight: '800', color: C.ink, lineHeight: 16, marginBottom: 3 },
  productCommon: { fontSize: 10, color: C.muted, marginBottom: 6 },

  // Advisory
  advisoryCard: { backgroundColor: '#fffbeb', borderRadius: 16, overflow: 'hidden', flexDirection: 'row', marginBottom: 20, borderWidth: 1, borderColor: '#fde68a', padding: 16, gap: 14, shadowColor: '#d97706', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 2 },
  advisoryIconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fef3c7', justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  advisoryBody: { flex: 1 },
  advisoryTitle: { fontSize: 14, fontWeight: '800', color: '#92400e', marginBottom: 4 },
  advisoryText: { fontSize: 12, color: '#b45309', lineHeight: 18, marginBottom: 10, fontWeight: '500' },
  advisoryActionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  advisoryLink: { fontSize: 12, fontWeight: '800', color: '#b45309' },

  // Weather
  weatherStrip: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.line, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  weatherIconBox: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.amberPale, justifyContent: 'center', alignItems: 'center' },
  weatherCenter: { flex: 1 },
  weatherTemp: { fontSize: 18, fontWeight: '900', color: C.ink },
  weatherCond: { fontSize: 12, fontWeight: '500', color: C.muted },
  weatherHint: { fontSize: 11.5, fontWeight: '700', color: C.green, marginTop: 3 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  modalClose: { alignSelf: 'flex-end', padding: 4, backgroundColor: C.bg, borderRadius: 20, marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: C.ink, marginBottom: 12, lineHeight: 26 },
  modalText: { fontSize: 14, color: '#374151', lineHeight: 22, fontWeight: '500', marginBottom: 20 },
  modalActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.green, borderRadius: 12, paddingVertical: 14, gap: 8 },
  modalActionText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
