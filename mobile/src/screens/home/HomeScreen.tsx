/**
 * HomeScreen — CLSL AI premium dashboard.
 * - mascot_new.png used throughout
 * - Live stats (product/crop counts) fetched from API
 * - 2-column quick-action grid, featured products strip
 * - True mobile-native feel: no web-like aesthetics
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Image, Dimensions, Platform, ActivityIndicator, FlatList, ImageBackground, Modal
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import { getCatalogue, getHomeStats, CatalogProduct } from '../../services/api';
import { FARMING_FACTS, FarmingFact } from '../../constants/FarmingFacts';

const { width: W } = Dimensions.get('window');
const H_PAD = 16;
const CARD_GAP = 12;
const CARD_W = (W - H_PAD * 2 - CARD_GAP) / 2;
const PRODUCT_CARD_W = W * 0.46;

// ── Design tokens ────────────────────────────────────────────────────────────
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

// ── Category color map ───────────────────────────────────────────────────────
const CAT_COLOR: Record<string, { bg: string; color: string }> = {
  'Insecticides':             { bg: '#fff3cd', color: '#856404' },
  'Fungicides':               { bg: C.limePale, color: C.green },
  'Weedicides':               { bg: '#d1ecf1', color: '#0c5460' },
  'Herbicides':               { bg: '#d1ecf1', color: '#0c5460' },
  'Seed Treatment':           { bg: '#e2d9f3', color: '#4a1d8c' },
  'Plant Growth Regulator':   { bg: C.tealPale, color: C.teal },
  'Bio Stimulant':            { bg: '#d4edda', color: '#155724' },
  'Micro Fertilizers':        { bg: '#cce5ff', color: '#004085' },
  'Sticking Agent':           { bg: '#ccfbf1', color: '#134e4a' },
  'Antibiotic / Bactericide': { bg: '#e0e7ff', color: '#312e81' },
};
const getCatStyle = (cat: string) =>
  CAT_COLOR[cat] || { bg: C.limePale, color: C.green };

// ── Quick actions ────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { id: 'inspect',    icon: 'leaf',                      lib: 'mci', color: C.green,    bg: C.limePale,  label: 'AI Crop Doctor', sub: 'Identify problems'   },
  { id: 'coupons',    icon: 'tag-outline',               lib: 'mci', color: C.red,      bg: C.redPale,   label: 'My Coupons',     sub: 'View your offers'    },
  { id: 'calculator', icon: 'calculator-variant-outline',lib: 'mci', color: C.teal,     bg: C.tealPale,  label: 'Spray Calc',     sub: 'Get right dosage'    },
  { id: 'assistant',  icon: 'chat-processing-outline',   lib: 'mci', color: C.purple,   bg: C.purplePale,label: 'Ask Mitra',      sub: 'Your farming friend' },
] as const;

type QuickAction = typeof QUICK_ACTIONS[number];

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── Component ────────────────────────────────────────────────────────────────
export default function HomeScreen({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { user, logout } = useAuth();

  const [stats, setStats]         = useState({ productCount: 73, cropCount: 25 });
  const [featured, setFeatured]   = useState<CatalogProduct[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // Daily insights state
  const flatListRef = useRef<FlatList>(null);
  const [facts, setFacts] = useState<FarmingFact[]>([]);
  const [currentFactIndex, setCurrentFactIndex] = useState(0);
  const scrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedFact, setSelectedFact] = useState<FarmingFact | null>(null);

  useEffect(() => {
    // Shuffle and pick 10 facts to show in this session
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
    return () => {
      if (scrollTimerRef.current) clearInterval(scrollTimerRef.current);
    };
  }, [currentFactIndex, facts.length]);

  useEffect(() => {
    let mounted = true;
    Promise.all([getHomeStats(), getCatalogue()])
      .then(([s, cat]) => {
        if (!mounted) return;
        setStats({ productCount: s.productCount, cropCount: s.cropCount });
        // Show top 8 products for the featured strip
        setFeatured((cat.items || []).slice(0, 8));
      })
      .catch(() => { /* silently keep defaults */ })
      .finally(() => { if (mounted) setStatsLoading(false); });
    return () => { mounted = false; };
  }, []);

  const renderIcon = (action: QuickAction) => {
    return action.lib === 'mci'
      ? <MaterialCommunityIcons name={action.icon as any} size={28} color={action.color} />
      : <Ionicons name={action.icon as any} size={28} color={action.color} />;
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <View style={s.topBarHeader}>
          <View style={s.topBarLeft}>
            <Image
              source={require('../../../assets/images/clsl-logo-leaf.png')}
              style={s.topBarLogo}
              resizeMode="contain"
            />
            <View>
              <Text style={s.topBarBrand}>CLSL</Text>
              <Text style={s.topBarTagline}>Crop care, made smarter.</Text>
            </View>
          </View>
          <View style={s.topBarRight}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20 }}>
              <Text style={{ color: C.ink, fontSize: 12, fontWeight: '800', marginRight: 4 }}>28°C</Text>
              <Ionicons name="partly-sunny" size={14} color={C.green} />
            </View>
            <TouchableOpacity style={s.topBarBtn} onPress={() => setShowNotifications(!showNotifications)}>
              <Ionicons name="notifications-outline" size={20} color={C.ink} />
              <View style={s.notifDot} />
            </TouchableOpacity>
          </View>
        </View>

      </View>

      {showNotifications && (
        <View style={{ position: 'absolute', top: Platform.OS === 'ios' ? 100 : 90, right: 16, backgroundColor: '#fff', borderRadius: 16, width: 280, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 10, zIndex: 100, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: C.ink }}>Notifications</Text>
            <TouchableOpacity onPress={() => setShowNotifications(false)}>
              <Ionicons name="close" size={16} color={C.muted} />
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }} onPress={() => { setShowNotifications(false); onNavigate?.('coupons'); }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.ink }}>New Coupon Added! 🎁</Text>
            <Text style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>You unlocked 10% off on your next purchase.</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }} onPress={() => { setShowNotifications(false); onNavigate?.('products'); }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.ink }}>New CLSL Product 🚀</Text>
            <Text style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>AMBUCROP is now available for your apple crops.</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={{ padding: 10 }} onPress={() => { setShowNotifications(false); onNavigate?.('assistant'); }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#e11d48' }}>Weather Advisory ⚠️</Text>
            <Text style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>High humidity detected. Increased risk of blight.</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero banner ────────────────────────────────────────────── */}
        <TouchableOpacity style={s.heroBanner} onPress={() => onNavigate?.('inspect')} activeOpacity={0.9}>
          <LinearGradient colors={[C.greenDark, '#1f4726']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroGrad}>
            <View style={s.heroBubble1} />
            <View style={s.heroBubble2} />
            <View style={s.heroContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                <View style={[s.heroBadge, { marginBottom: 0 }]}>
                  <Ionicons name="leaf" size={10} color={C.lime} />
                  <Text style={s.heroBadgeText}>AI-POWERED</Text>
                </View>
                {user?.district && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999 }}>
                    <Ionicons name="location-outline" size={10} color={C.lime} />
                    <Text style={{ fontSize: 8.5, color: '#fff', marginLeft: 2, fontWeight: '700' }}>{user.district}</Text>
                  </View>
                )}
              </View>
              
              <Text style={{ fontSize: 11, color: C.lime, fontWeight: '700', marginBottom: 2 }}>{greeting()}, {user?.first_name || 'Farmer'} 👋</Text>
              <Text style={s.heroTitle}>How can we{'\n'}help your farm?</Text>
              <Text style={s.heroBody}>Crop protection & discovery.</Text>
              
              <View style={s.heroBtn}>
                <Ionicons name="scan" size={14} color={C.greenDark} />
                <Text style={s.heroBtnText}>Scan your crop</Text>
              </View>
            </View>
            <Image source={require('../../../assets/images/mascot_v3.png')} style={{ position: 'absolute', right: 5, bottom: -5, width: 130, height: 130, aspectRatio: 1 }} resizeMode="contain" />
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Featured products ─────────────────────────────────────── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Recommended products</Text>
          <TouchableOpacity onPress={() => onNavigate?.('products')}>
            <Text style={s.seeAll}>See all {stats.productCount}+ →</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.productStrip}
        >
          {featured.length === 0
            ? [0, 1, 2].map(i => <View key={i} style={[s.productCard, s.productCardSkeleton]} />)
            : featured.map(product => {
                const catStyle = getCatStyle(product.category);
                const imgUrl = productImageUrl(product.image);
                return (
                  <TouchableOpacity
                    key={product.id}
                    style={s.productCard}
                    onPress={() => onNavigate?.('products')}
                    activeOpacity={0.82}
                  >
                    {/* Product image / placeholder */}
                    <View style={s.productImgBox}>
                      {imgUrl ? (
                        <Image
                          source={{ uri: imgUrl }}
                          style={s.productImg}
                          resizeMode="contain"
                        />
                      ) : (
                        <MaterialCommunityIcons
                          name="bottle-tonic-outline"
                          size={36}
                          color={C.green}
                        />
                      )}
                    </View>
                    {/* Category pill */}
                    <View style={[s.catPill, { backgroundColor: catStyle.bg }]}>
                      <Text style={[s.catPillText, { color: catStyle.color }]} numberOfLines={1}>
                        {product.category}
                      </Text>
                    </View>
                    <Text style={s.productName} numberOfLines={2}>{product.name}</Text>
                    <Text style={s.productCommon} numberOfLines={1}>{product.commonName}</Text>
                    {(product.approvedCrops || []).length > 0 && (
                      <View style={s.cropPillRow}>
                        {product.approvedCrops.slice(0, 2).map(c => (
                          <View key={c} style={s.cropPill}>
                            <Text style={s.cropPillText} numberOfLines={1}>{c}</Text>
                          </View>
                        ))}
                        {product.approvedCrops.length > 2 && (
                          <Text style={s.cropMore}>+{product.approvedCrops.length - 2}</Text>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
        </ScrollView>

        {/* ── Quick actions — 2 × 2 grid ───────────────────────────── */}
        <Text style={s.sectionTitle}>Quick actions</Text>
        <View style={s.quickGrid}>
          {QUICK_ACTIONS.map(action => (
            <TouchableOpacity
              key={action.id}
              style={s.quickCard}
              onPress={() => onNavigate?.(action.id)}
              activeOpacity={0.76}
            >
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
              let bg = C.card;
              let border = C.line;
              let icon = 'bulb-outline';
              let iconColor = C.amber;
              let iconBg = C.amberPale;
              
              if (item.type === 'offer') {
                bg = '#faf5ff'; border = '#e9d5ff'; icon = 'gift-outline'; iconColor = '#9333ea'; iconBg = '#f3e8ff';
              } else if (item.type === 'clsl') {
                bg = '#f2fdf5'; border = '#bbf7d0'; icon = 'leaf-outline'; iconColor = '#16a34a'; iconBg = '#dcfce7';
              } else if (item.type === 'tip') {
                bg = '#f0f9ff'; border = '#bae6fd'; icon = 'water-outline'; iconColor = '#0369a1'; iconBg = '#e0f2fe';
              }

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
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: iconColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {item.type === 'clsl' ? 'CLSL Insight' : item.type.toUpperCase()}
                        </Text>
                      </View>
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
        <TouchableOpacity
          style={s.weatherStrip}
          onPress={() => onNavigate?.('weather')}
          activeOpacity={0.8}
        >
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
      <Modal
        visible={!!selectedFact}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedFact(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <View style={[s.modalIconBox, { 
                backgroundColor: selectedFact?.type === 'offer' ? '#f3e8ff' : 
                                 selectedFact?.type === 'clsl' ? '#dcfce7' : 
                                 selectedFact?.type === 'tip' ? '#e0f2fe' : C.amberPale
              }]}>
                <Ionicons 
                  name={selectedFact?.type === 'offer' ? 'gift-outline' : 
                        selectedFact?.type === 'clsl' ? 'leaf-outline' : 
                        selectedFact?.type === 'tip' ? 'water-outline' : 'bulb-outline'} 
                  size={24} 
                  color={selectedFact?.type === 'offer' ? '#9333ea' : 
                         selectedFact?.type === 'clsl' ? '#16a34a' : 
                         selectedFact?.type === 'tip' ? '#0369a1' : C.amber} 
                />
              </View>
              <TouchableOpacity onPress={() => setSelectedFact(null)} style={s.modalClose}>
                <Ionicons name="close" size={24} color={C.muted} />
              </TouchableOpacity>
            </View>
            
            <Text style={{ fontSize: 10, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              {selectedFact?.type === 'clsl' ? 'CLSL Insight' : selectedFact?.type?.toUpperCase()}
            </Text>
            <Text style={s.modalTitle}>{selectedFact?.title}</Text>
            <Text style={s.modalText}>{selectedFact?.text}</Text>

            {selectedFact?.actionText && (
              <TouchableOpacity 
                style={s.modalActionBtn}
                onPress={() => {
                  const route = selectedFact.actionRoute;
                  setSelectedFact(null);
                  if (route) onNavigate?.(route);
                }}
              >
                <Text style={s.modalActionText}>{selectedFact.actionText}</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Top bar
  topBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 34,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  topBarHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topBarLogo: { width: 34, height: 34, borderRadius: 8 },
  topBarBrand: { fontSize: 16, fontWeight: '900', color: '#0B4783', letterSpacing: -0.3 },
  topBarTagline: { fontSize: 10, color: '#0B4783', marginTop: 1 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  topBarBtn: { position: 'relative', padding: 4 },
  notifDot: {
    position: 'absolute', top: 2, right: 2,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: C.lime, borderWidth: 1.5, borderColor: C.greenDark,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.lime, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: { color: C.greenDark, fontWeight: '900', fontSize: 15 },

  scroll: { paddingHorizontal: H_PAD, paddingTop: 24 },

  // Greeting
  greetRow: { paddingHorizontal: 4 },
  greetSub: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.85)' },
  greetName: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginTop: 2 },
  locationPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, alignSelf: 'flex-start', marginTop: 12,
  },
  locationText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Hero banner
  heroBanner: {
    borderRadius: 18, overflow: 'hidden', marginBottom: 24,
    shadowColor: C.greenDark, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2, shadowRadius: 16, elevation: 6,
  },
  heroGrad: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingLeft: 16, paddingTop: 18, paddingBottom: 0,
    minHeight: 120, overflow: 'hidden',
  },
  heroBubble1: {
    position: 'absolute', top: -50, right: -40,
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 30, borderColor: 'rgba(203,233,104,0.13)',
  },
  heroBubble2: {
    position: 'absolute', bottom: 20, left: -30,
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 16, borderColor: 'rgba(255,255,255,0.08)',
  },
  heroContent: { width: W * 0.54, paddingBottom: 16 },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(203,233,104,0.2)',
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 999, alignSelf: 'flex-start', marginBottom: 8,
  },
  heroBadgeText: { fontSize: 8, fontWeight: '800', color: C.lime, letterSpacing: 1 },
  heroTitle: {
    fontSize: 17, fontWeight: '900', color: '#fff',
    lineHeight: 22, letterSpacing: -0.4, marginBottom: 6,
  },
  heroBody: {
    fontSize: 10, color: 'rgba(255,255,255,0.8)',
    lineHeight: 14, marginBottom: 12,
  },
  heroBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.lime, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  heroBtnText: { fontSize: 11, fontWeight: '800', color: C.ink },

  // Live stats bar
  statsBar: {
    flexDirection: 'row', backgroundColor: C.greenDark,
    paddingVertical: 13, paddingHorizontal: 20,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '900', color: C.lime, letterSpacing: -0.3 },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 },

  // Section headers
  sectionTitle: { fontSize: 17, fontWeight: '900', color: C.ink, letterSpacing: -0.3, marginBottom: 12 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAll: { fontSize: 12, fontWeight: '700', color: C.green },

  // Quick actions grid
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, marginBottom: 24 },
  quickCard: {
    width: CARD_W, backgroundColor: C.card, borderRadius: 16,
    padding: 14, borderWidth: 1, borderColor: C.line,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    minHeight: 110,
  },
  quickTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  quickIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  quickLabel: { fontSize: 13, fontWeight: '900', color: C.ink, marginBottom: 2 },
  quickSub: { fontSize: 11, color: C.muted, fontWeight: '500', lineHeight: 14 },

  // Featured products strip
  productStrip: { paddingRight: H_PAD, paddingBottom: 6, gap: 12, marginBottom: 24 },
  productCard: {
    width: PRODUCT_CARD_W, backgroundColor: C.card,
    borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.line,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  productCardSkeleton: { height: 180, opacity: 0.4, backgroundColor: C.line },
  productImgBox: {
    width: '100%', height: 90, backgroundColor: C.bg,
    borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8,
    overflow: 'hidden',
  },
  productImg: { width: '100%', height: '100%' },
  catPill: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 6 },
  catPillText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.3 },
  productName: { fontSize: 12, fontWeight: '800', color: C.ink, lineHeight: 16, marginBottom: 3 },
  productCommon: { fontSize: 10, color: C.muted, marginBottom: 6 },
  cropPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cropPill: { backgroundColor: C.limePale, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  cropPillText: { fontSize: 8.5, fontWeight: '600', color: C.green },
  cropMore: { fontSize: 8.5, fontWeight: '700', color: C.muted, alignSelf: 'center' },

  // Advisory card
  advisoryCard: {
    backgroundColor: '#fffbeb', borderRadius: 16, overflow: 'hidden',
    flexDirection: 'row', marginBottom: 20, borderWidth: 1, borderColor: '#fde68a',
    padding: 16, gap: 14,
    shadowColor: '#d97706', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 2,
  },
  advisoryIconBox: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#fef3c7',
    justifyContent: 'center', alignItems: 'center', marginTop: 2,
  },
  advisoryBody: { flex: 1 },
  advisoryTitle: { fontSize: 14, fontWeight: '800', color: '#92400e', marginBottom: 4 },
  advisoryText: { fontSize: 12, color: '#b45309', lineHeight: 18, marginBottom: 10, fontWeight: '500' },
  advisoryActionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  advisoryLink: { fontSize: 12, fontWeight: '800', color: '#b45309' },

  // Weather
  weatherStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: C.line, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  weatherIconBox: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: C.amberPale,
    justifyContent: 'center', alignItems: 'center',
  },
  weatherCenter: { flex: 1 },
  weatherTemp: { fontSize: 18, fontWeight: '900', color: C.ink },
  weatherCond: { fontSize: 12, fontWeight: '500', color: C.muted },
  weatherHint: { fontSize: 11.5, fontWeight: '700', color: C.green, marginTop: 3 },
  weatherRight: { alignItems: 'flex-end', gap: 4 },
  weatherStat: { fontSize: 12, fontWeight: '700', color: C.muted },

  // Ask Mitra promo
  mitraBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.greenDark, borderRadius: 20,
    overflow: 'hidden', paddingRight: 16,
    shadowColor: C.greenDark, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
    marginBottom: 10,
  },
  mitraMascot: { width: 100, height: 120 },
  mitraContent: { flex: 1, paddingVertical: 18 },
  mitraTitle: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.3, marginBottom: 5 },
  mitraSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.65)', lineHeight: 16, marginBottom: 12 },
  mitraBtn: {
    backgroundColor: C.lime, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start',
  },
  mitraBtnText: { fontSize: 12, fontWeight: '800', color: C.ink },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  modalIconBox: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  modalClose: { padding: 4, backgroundColor: C.bg, borderRadius: 20 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: C.ink, marginBottom: 12, lineHeight: 26 },
  modalText: { fontSize: 14, color: '#374151', lineHeight: 22, fontWeight: '500', marginBottom: 20 },
  modalActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.green, borderRadius: 12, paddingVertical: 14, gap: 8 },
  modalActionText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
