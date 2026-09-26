/**
 * HomeScreen — CLSL AI premium dashboard.
 * - mascot_new.png used throughout
 * - Live stats (product/crop counts) fetched from API
 * - 2-column quick-action grid, featured products strip
 * - True mobile-native feel: no web-like aesthetics
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Image, Dimensions, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../contexts/AuthContext';
import { getCatalogue, getHomeStats, CatalogProduct } from '../../services/api';

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
  'Sticking Agent':           { bg: '#f8d7da', color: '#721c24' },
  'Antibiotic / Bactericide': { bg: '#f5c6cb', color: '#721c24' },
};
const getCatStyle = (cat: string) =>
  CAT_COLOR[cat] || { bg: C.limePale, color: C.green };

// ── Quick actions ────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { id: 'inspect',    icon: 'leaf',                      lib: 'mci', color: C.green,    bg: C.limePale,  label: 'AI Crop Doctor', sub: 'Identify problems'   },
  { id: 'products',   icon: 'bottle-tonic-outline',      lib: 'mci', color: C.greenDark,bg: C.pale,      label: 'Products',       sub: 'Browse solutions'    },
  { id: 'weather',    icon: 'partly-sunny-outline',      lib: 'ion', color: C.amber,    bg: C.amberPale, label: 'Weather',        sub: 'Live farm weather'   },
  { id: 'coupons',    icon: 'tag-outline',               lib: 'mci', color: C.red,      bg: C.redPale,   label: 'My Coupons',     sub: 'View your offers'    },
  { id: 'calculator', icon: 'calculator-variant-outline',lib: 'mci', color: C.teal,     bg: C.tealPale,  label: 'Spray Calc',     sub: 'Get right dosage'    },
  { id: 'assistant',  icon: 'chat-outline',              lib: 'mci', color: C.purple,   bg: C.purplePale,label: 'Ask Mitra',      sub: 'Your farming friend' },
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

  const renderIcon = (action: QuickAction) =>
    action.lib === 'mci'
      ? <MaterialCommunityIcons name={action.icon as any} size={28} color={action.color} />
      : <Ionicons name={action.icon as any} size={28} color={action.color} />;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.greenDark} />

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <View style={s.topBar}>
        <View style={s.topBarLeft}>
          <Image
            source={require('../../../assets/images/clsl-logo.png')}
            style={s.topBarLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={s.topBarBrand}>CLSL AI</Text>
            <Text style={s.topBarTagline}>Crop care, made smarter.</Text>
          </View>
        </View>
        <View style={s.topBarRight}>
          <TouchableOpacity style={s.topBarBtn}>
            <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.85)" />
            <View style={s.notifDot} />
          </TouchableOpacity>
          <TouchableOpacity onPress={logout}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{(user?.first_name || 'U')[0].toUpperCase()}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Greeting ─────────────────────────────────────────────── */}
        <View style={s.greetRow}>
          <Text style={s.greetSub}>{greeting()},</Text>
          <Text style={s.greetName}>{user?.first_name || 'Farmer'} 👋</Text>
          {user?.district ? (
            <View style={s.locationPill}>
              <Ionicons name="location-outline" size={12} color={C.green} />
              <Text style={s.locationText}>{user.district} district</Text>
            </View>
          ) : null}
        </View>

        {/* ── Hero banner ──────────────────────────────────────────── */}
        <View style={s.heroBanner}>
          <LinearGradient
            colors={[C.greenDark, '#2a5510', C.green]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.heroGrad}
          >
            {/* Decorative bubbles */}
            <View style={s.heroBubble1} />
            <View style={s.heroBubble2} />

            {/* Left content — fixed 56% width */}
            <View style={s.heroContent}>
              <View style={s.heroBadge}>
                <MaterialCommunityIcons name="leaf" size={10} color={C.lime} />
                <Text style={s.heroBadgeText}>AI-POWERED</Text>
              </View>
              <Text style={s.heroTitle}>How can we{'\n'}help your farm?</Text>
              <Text style={s.heroBody}>Crop protection & product discovery, all in one place.</Text>
              <TouchableOpacity
                style={s.heroBtn}
                onPress={() => onNavigate?.('inspect')}
                activeOpacity={0.88}
              >
                <MaterialCommunityIcons name="camera-plus-outline" size={15} color={C.ink} />
                <Text style={s.heroBtnText}>Scan your crop</Text>
              </TouchableOpacity>
            </View>

            {/* Mascot */}
            <View style={s.heroMascotBox}>
              <Image
                source={require('../../../assets/images/mascot_new.png')}
                style={s.heroMascot}
                resizeMode="contain"
              />
            </View>
          </LinearGradient>

          {/* Live stats bar */}
          <View style={s.statsBar}>
            <View style={s.statItem}>
              {statsLoading
                ? <ActivityIndicator size="small" color={C.lime} />
                : <Text style={s.statVal}>{stats.productCount}+</Text>}
              <Text style={s.statLabel}>Products</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              {statsLoading
                ? <ActivityIndicator size="small" color={C.lime} />
                : <Text style={s.statVal}>{stats.cropCount}+</Text>}
              <Text style={s.statLabel}>Crops covered</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statVal}>AI</Text>
              <Text style={s.statLabel}>Smart diagnosis</Text>
            </View>
          </View>
        </View>

        {/* ── Quick actions — 2 × 3 grid ───────────────────────────── */}
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

        {/* ── Featured products ─────────────────────────────────────── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Our products</Text>
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

        {/* ── Crop advisory ─────────────────────────────────────────── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Crop advisory</Text>
          <TouchableOpacity>
            <Text style={s.seeAll}>See all ›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.advisoryCard} activeOpacity={0.85}>
          <Image
            source={require('../../../assets/images/field_only.png')}
            style={s.advisoryImg}
            resizeMode="cover"
          />
          <View style={s.advisoryBody}>
            <View style={s.advisoryBadge}>
              <MaterialCommunityIcons name="leaf" size={10} color={C.green} />
              <Text style={s.advisoryBadgeText}>Crop Advisory</Text>
            </View>
            <Text style={s.advisoryTitle}>Protect tomato from early blight</Text>
            <Text style={s.advisoryText}>
              Warm and humid conditions can increase early blight risk. Take preventive measures now.
            </Text>
            <Text style={s.advisoryLink}>Read advisory →</Text>
          </View>
        </TouchableOpacity>

        {/* ── Weather strip ─────────────────────────────────────────── */}
        <TouchableOpacity
          style={s.weatherStrip}
          onPress={() => onNavigate?.('weather')}
          activeOpacity={0.8}
        >
          <View style={s.weatherIconBox}>
            <Ionicons name="partly-sunny" size={32} color={C.amber} />
          </View>
          <View style={s.weatherCenter}>
            <Text style={s.weatherTemp}>28°C <Text style={s.weatherCond}>· Partly cloudy</Text></Text>
            <Text style={s.weatherHint}>Good spraying window until 11:30 AM</Text>
          </View>
          <View style={s.weatherRight}>
            <Text style={s.weatherStat}>💧 46%</Text>
            <Text style={s.weatherStat}>🌬 12 km/h</Text>
          </View>
        </TouchableOpacity>

        {/* ── Ask Mitra promo banner ────────────────────────────────── */}
        <TouchableOpacity
          style={s.mitraBanner}
          onPress={() => onNavigate?.('assistant')}
          activeOpacity={0.84}
        >
          <Image
            source={require('../../../assets/images/mascot_new.png')}
            style={s.mitraMascot}
            resizeMode="contain"
          />
          <View style={s.mitraContent}>
            <Text style={s.mitraTitle}>Ask Mitra</Text>
            <Text style={s.mitraSub}>Your 24/7 farming AI — ask about crops, diseases, dosages & more</Text>
            <View style={s.mitraBtn}>
              <Text style={s.mitraBtnText}>Start chatting →</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.greenDark,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'ios' ? 52 : 38,
    paddingBottom: 14,
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  topBarLogo: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#fff' },
  topBarBrand: { fontSize: 17, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  topBarTagline: { fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
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

  scroll: { paddingHorizontal: H_PAD, paddingTop: 20 },

  // Greeting
  greetRow: { marginBottom: 20 },
  greetSub: { fontSize: 13, fontWeight: '500', color: C.muted },
  greetName: { fontSize: 26, fontWeight: '900', color: C.ink, letterSpacing: -0.5, marginTop: 1 },
  locationPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.limePale, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, alignSelf: 'flex-start', marginTop: 10,
  },
  locationText: { fontSize: 12, fontWeight: '700', color: C.green },

  // Hero banner
  heroBanner: {
    borderRadius: 22, overflow: 'hidden', marginBottom: 28,
    shadowColor: C.greenDark, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3, shadowRadius: 22, elevation: 10,
  },
  heroGrad: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingLeft: 20, paddingTop: 24, paddingBottom: 0,
    minHeight: 195, overflow: 'hidden',
  },
  heroBubble1: {
    position: 'absolute', top: -70, right: -60,
    width: 190, height: 190, borderRadius: 95,
    borderWidth: 45, borderColor: 'rgba(203,233,104,0.13)',
  },
  heroBubble2: {
    position: 'absolute', bottom: 30, left: -40,
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 22, borderColor: 'rgba(255,255,255,0.08)',
  },
  heroContent: { width: W * 0.56, paddingBottom: 22 },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(203,233,104,0.2)',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999, alignSelf: 'flex-start', marginBottom: 10,
  },
  heroBadgeText: { fontSize: 8.5, fontWeight: '800', color: C.lime, letterSpacing: 1.3 },
  heroTitle: {
    fontSize: 21, fontWeight: '900', color: '#fff',
    lineHeight: 27, letterSpacing: -0.4, marginBottom: 9,
  },
  heroBody: {
    fontSize: 11, color: 'rgba(255,255,255,0.68)',
    lineHeight: 17, marginBottom: 16,
  },
  heroBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: C.lime, borderRadius: 10,
    paddingHorizontal: 13, paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  heroBtnText: { fontSize: 12, fontWeight: '800', color: C.ink },
  heroMascotBox: { width: W * 0.42, alignItems: 'center', justifyContent: 'flex-end' },
  heroMascot: { width: W * 0.42, height: W * 0.54 },

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
  sectionTitle: { fontSize: 18, fontWeight: '900', color: C.ink, letterSpacing: -0.3, marginBottom: 14 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  seeAll: { fontSize: 13, fontWeight: '700', color: C.green },

  // Quick actions grid
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP, marginBottom: 30 },
  quickCard: {
    width: CARD_W, backgroundColor: C.card, borderRadius: 18,
    padding: 16, borderWidth: 1, borderColor: C.line,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  quickTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },
  quickIconBox: { width: 50, height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  quickLabel: { fontSize: 14, fontWeight: '800', color: C.ink, marginBottom: 3 },
  quickSub: { fontSize: 12, color: C.muted, fontWeight: '500' },

  // Featured products strip
  productStrip: { paddingRight: H_PAD, paddingBottom: 6, gap: 12, marginBottom: 28 },
  productCard: {
    width: PRODUCT_CARD_W, backgroundColor: C.card,
    borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.line,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  productCardSkeleton: { height: 200, opacity: 0.4, backgroundColor: C.line },
  productImgBox: {
    width: '100%', height: 110, backgroundColor: C.bg,
    borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 10,
    overflow: 'hidden',
  },
  productImg: { width: '100%', height: '100%' },
  catPill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 },
  catPillText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  productName: { fontSize: 13, fontWeight: '800', color: C.ink, lineHeight: 18, marginBottom: 4 },
  productCommon: { fontSize: 10.5, color: C.muted, marginBottom: 8 },
  cropPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cropPill: { backgroundColor: C.limePale, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  cropPillText: { fontSize: 9.5, fontWeight: '600', color: C.green },
  cropMore: { fontSize: 9.5, fontWeight: '700', color: C.muted, alignSelf: 'center' },

  // Advisory card
  advisoryCard: {
    backgroundColor: C.card, borderRadius: 20, overflow: 'hidden',
    flexDirection: 'row', marginBottom: 20, borderWidth: 1, borderColor: C.line,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, minHeight: 130,
  },
  advisoryImg: { width: 110 },
  advisoryBody: { flex: 1, padding: 14 },
  advisoryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.limePale,
    borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start', marginBottom: 8,
  },
  advisoryBadgeText: { fontSize: 10, fontWeight: '800', color: C.green },
  advisoryTitle: { fontSize: 14, fontWeight: '800', color: C.ink, lineHeight: 19, marginBottom: 6 },
  advisoryText: { fontSize: 11.5, color: C.muted, lineHeight: 17, marginBottom: 8 },
  advisoryLink: { fontSize: 12.5, fontWeight: '700', color: C.green },

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
});
