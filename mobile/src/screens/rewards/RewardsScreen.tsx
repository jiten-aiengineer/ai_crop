/**
 * RewardsScreen — Unified Coupons + Rewards page for CLSL AI
 * 
 * Two internal tabs:
 *   - "Coupons"  — existing coupon list (available / used)
 *   - "Rewards"  — points balance, activity log, redeemable products
 * 
 * Props:
 *   onBack: () => void
 *   initialTab?: 'coupons' | 'rewards'  — defaults to 'coupons'
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Image, Modal,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity,
  View, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import GlobalHeader from '../../components/GlobalHeader';
import { useAuth } from '../../contexts/AuthContext';
import {
  getMyCoupons, getMyRewards, logRewardActivity,
  redeemRewardProduct, RewardActivity, RewardProduct, RewardsData,
} from '../../services/api';
import { Colors } from '../../config/theme';

const { width: W } = Dimensions.get('window');

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  green:      Colors.primary,
  greenDark:  Colors.primaryDark,
  greenMid:   Colors.primaryLight,
  lime:       Colors.accent,
  limePale:   Colors.accentLight,
  ink:        Colors.text,
  muted:      Colors.textMuted,
  bg:         Colors.background,
  card:       Colors.card,
  line:       Colors.border,
  amber:      '#d97706',
  amberPale:  '#fffbeb',
  purple:     '#6d28d9',
  purplePale: '#f5f3ff',
  red:        Colors.error,
  redPale:    '#fef2f2',
  teal:       '#0d7d72',
  tealPale:   '#e6f7f5',
};

type Coupon = {
  code: string;
  title: string;
  discount: string;
  expires: string;
  status: 'available' | 'used';
  description?: string;
  productImage?: string | null;
  productName?: string;
  packing?: string;
  daysRemaining?: number;
};

const ACTIVITY_META: Record<string, { icon: string; color: string; label: string }> = {
  daily_login:              { icon: 'sunny-outline', color: C.amber,  label: 'Daily Login'       },
  crop_inspection:          { icon: 'leaf-outline',  color: C.green,  label: 'Crop Inspection'   },
  coupon_engagement:        { icon: 'pricetag-outline', color: C.purple, label: 'Coupon Activity' },
  manual_credit:            { icon: 'add-circle-outline', color: C.teal, label: 'Bonus Points'   },
  manual_deduct:            { icon: 'remove-circle-outline', color: C.red, label: 'Points Deducted' },
  reward_product_redemption:{ icon: 'gift-outline', color: C.purple, label: 'Product Redeemed'  },
};

export default function RewardsScreen({
  onBack,
  onNavigate,
  initialTab = 'coupons',
}: {
  onBack: () => void;
  onNavigate?: (screen: string) => void;
  initialTab?: 'coupons' | 'rewards';
}) {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'coupons' | 'rewards'>(initialTab);

  // ── Coupons state ────────────────────────────────────────────────────────
  const [couponTab, setCouponTab] = useState<'available' | 'used'>('available');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponLoading, setCouponLoading] = useState(true);
  const [couponError, setCouponError] = useState('');
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanInput, setScanInput] = useState('');

  // ── Rewards state ─────────────────────────────────────────────────────────
  const [rewardsData, setRewardsData] = useState<RewardsData | null>(null);
  const [rewardsLoading, setRewardsLoading] = useState(false);
  const [rewardsError, setRewardsError] = useState('');
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  // ── Load coupons ──────────────────────────────────────────────────────────
  const loadCoupons = useCallback(async () => {
    if (!token || user?.role === 'dealer') return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const r = await getMyCoupons(token);
      const available: Coupon[] = (r.coupons || []).map((x, i) => {
        let daysRem = -1;
        if (x.expires_at) {
           const diff = new Date(String(x.expires_at)).getTime() - Date.now();
           daysRem = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        }
        return {
          code: String(x.code || `CLSL${i + 1}`),
          title: String(x.campaign_name || x.title || 'CLSL product reward'),
          description: x.description ? String(x.description) : undefined,
          productImage: x.product_image_url ? String(x.product_image_url) : null,
          productName: x.products && Array.isArray(x.products) && x.products.length > 0 ? String(x.products[0]) : undefined,
          packing: x.packings && Array.isArray(x.packings) && x.packings.length > 0 ? String(x.packings[0]) : undefined,
          discount: x.discount_type === 'percentage'
            ? `${x.discount_value}% OFF`
            : `₹${x.discount_value || 0} OFF`,
          expires: x.expires_at
            ? new Date(String(x.expires_at)).toLocaleDateString('en-IN')
            : 'See offer terms',
          status: 'available' as const,
          daysRemaining: daysRem >= 0 ? daysRem : undefined,
        };
      });
      const used: Coupon[] = (r.redemptions || []).map((x, i) => ({
        code: String(x.code || `USED${i + 1}`),
        title: String(x.campaign_name || 'CLSL product reward'),
        description: x.description ? String(x.description) : undefined,
        productImage: x.product_image_url ? String(x.product_image_url) : null,
        productName: x.products && Array.isArray(x.products) && x.products.length > 0 ? String(x.products[0]) : undefined,
        packing: x.packings && Array.isArray(x.packings) && x.packings.length > 0 ? String(x.packings[0]) : undefined,
        discount: `₹${Number(x.amount_redeemed || 0).toFixed(2)} SAVED`,
        expires: x.redeemed_at
          ? `Redeemed ${new Date(String(x.redeemed_at)).toLocaleDateString('en-IN')}`
          : 'Redeemed',
        status: 'used' as const,
      }));
      setCoupons([...available, ...used]);
    } catch {
      setCouponError('Coupons could not be loaded.');
    } finally {
      setCouponLoading(false);
    }
  }, [token, user?.role]);

  // ── Load rewards ──────────────────────────────────────────────────────────
  const loadRewards = useCallback(async () => {
    if (!token || user?.role !== 'farmer') return;
    setRewardsLoading(true);
    setRewardsError('');
    try {
      const data = await getMyRewards(token);
      setRewardsData(data);
    } catch {
      setRewardsError('Rewards could not be loaded.');
    } finally {
      setRewardsLoading(false);
    }
  }, [token, user?.role]);

  useEffect(() => {
    void loadCoupons();
    void loadRewards();
  }, [loadCoupons, loadRewards]);

  // Silent engagement log when coupon tab is viewed
  useEffect(() => {
    if (activeTab === 'coupons' && token && user?.role === 'farmer') {
      logRewardActivity(token, 'coupon_engagement').catch(() => {});
    }
  }, [activeTab, token, user?.role]);

  const handleRedeem = async (product: RewardProduct) => {
    if (!token) return;
    if ((rewardsData?.points ?? 0) < product.points_required) {
      Alert.alert(
        'Not Enough Points',
        `You need ${product.points_required} points to redeem this product.\nYou currently have ${rewardsData?.points ?? 0} points.`,
      );
      return;
    }
    Alert.alert(
      'Redeem Reward',
      `Redeem "${product.product_name}" for ${product.points_required} points?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            setRedeemingId(product.id);
            try {
              const r = await redeemRewardProduct(token, product.id);
              Alert.alert('🎉 Redeemed!', `Your coupon code is: ${r.coupon_code}\n\nPresent this to your CLSL dealer.`);
              void loadRewards();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not redeem.');
            } finally {
              setRedeemingId(null);
            }
          },
        },
      ],
    );
  };

  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const p = await requestCameraPermission();
      if (!p.granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to scan QR codes.');
        return;
      }
    }
    setIsCameraOpen(true);
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderCouponCard = (coupon: Coupon) => {
    const isAvailable = coupon.status === 'available';
    // Calculate days remaining message
    let expiryMessage = coupon.expires;
    if (isAvailable && coupon.daysRemaining !== undefined) {
      if (coupon.daysRemaining > 0) {
        expiryMessage = `Expires in ${coupon.daysRemaining} day${coupon.daysRemaining > 1 ? 's' : ''}`;
      } else if (coupon.daysRemaining === 0) {
        expiryMessage = 'Expires today';
      } else {
        expiryMessage = 'Expired';
      }
    }
    
    return (
      <TouchableOpacity
        key={coupon.code}
        style={[s.couponCard, !isAvailable && s.couponCardUsed]}
        onPress={() => setSelectedCoupon(coupon)}
        activeOpacity={0.82}
      >
        {/* Ticket notch */}
        <View style={[s.couponNotchLeft, !isAvailable && { backgroundColor: C.bg }]} />
        <View style={[s.couponNotchRight, !isAvailable && { backgroundColor: C.bg }]} />

        <View style={s.couponLeft}>
           <View style={[s.couponIconBox, { backgroundColor: 'transparent' }]}>
            {coupon.productImage ? (
              <Image source={{ uri: coupon.productImage.startsWith('/') ? `https://ai.croplifescience.com${coupon.productImage}` : coupon.productImage }} style={{ width: 44, height: 44 }} resizeMode="contain" />
            ) : (
              <Image source={require('../../../assets/images/clsl-logo.png')} style={{ width: 44, height: 44 }} resizeMode="contain" />
            )}
          </View>
        </View>
        <View style={s.couponDivider} />
        <View style={s.couponBody}>
          <Text style={s.couponTitle} numberOfLines={2}>{coupon.title}</Text>
          {coupon.productName && <Text style={{ fontSize: 12, color: C.greenMid, fontWeight: '700', marginBottom: 2 }} numberOfLines={1}>{coupon.productName} {coupon.packing ? `(${coupon.packing})` : ''}</Text>}
          {coupon.description && <Text style={{ fontSize: 11, color: C.muted, marginBottom: 4 }} numberOfLines={2}>{coupon.description}</Text>}
          <Text style={[s.couponDiscount, { color: isAvailable ? C.green : C.muted }]}>
            {coupon.discount}
          </Text>
          <Text style={s.couponExpiry}>{expiryMessage}</Text>
        </View>
        <View style={s.couponRight}>
          {isAvailable ? (
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="qr-code-outline" size={28} color={C.green} style={{ marginBottom: 4 }} />
              <Text style={{ fontSize: 10, fontWeight: '800', color: C.green }}>TAP TO</Text>
              <Text style={{ fontSize: 10, fontWeight: '800', color: C.green }}>REDEEM</Text>
            </View>
          ) : (
            <View style={[s.usedBadge]}>
              <Text style={s.usedBadgeText}>USED</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderActivityRow = (activity: RewardActivity, idx: number) => {
    const meta = ACTIVITY_META[activity.activity_type] || { icon: 'star-outline', color: C.muted, label: activity.activity_type };
    const isPositive = activity.points > 0;
    return (
      <View key={idx} style={s.activityRow}>
        <View style={[s.activityIcon, { backgroundColor: meta.color + '18' }]}>
          <Ionicons name={meta.icon as any} size={16} color={meta.color} />
        </View>
        <View style={s.activityBody}>
          <Text style={s.activityLabel}>{activity.description || meta.label}</Text>
          <Text style={s.activityDate}>
            {new Date(activity.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </View>
        <Text style={[s.activityPoints, { color: isPositive ? C.green : C.red }]}>
          {isPositive ? '+' : ''}{activity.points} pts
        </Text>
      </View>
    );
  };

  const renderProductCard = (product: RewardProduct) => {
    const userPoints = rewardsData?.points ?? 0;
    const isLocked = userPoints < product.points_required;
    const progress = Math.min(1, userPoints / product.points_required);
    return (
      <View key={product.id} style={[s.productCard, isLocked && s.productCardLocked]}>
        <View style={s.productImgBox}>
          {product.product_image_url ? (
            <Image source={{ uri: product.product_image_url }} style={s.productImg} resizeMode="contain" />
          ) : (
            <MaterialCommunityIcons name="bottle-tonic-outline" size={36} color={isLocked ? C.muted : C.green} />
          )}
          {isLocked && (
            <View style={s.lockOverlay}>
              <Ionicons name="lock-closed" size={24} color="#fff" />
            </View>
          )}
        </View>
        <Text style={[s.productName, isLocked && { color: C.muted }]} numberOfLines={2}>
          {product.product_name}
        </Text>
        <View style={s.pointsBar}>
          <View style={[s.pointsFill, { width: `${progress * 100}%` as any }]} />
        </View>
        <Text style={s.pointsNeeded}>
          {isLocked
            ? `${product.points_required - userPoints} more pts`
            : `${product.points_required} pts`}
        </Text>
        <TouchableOpacity
          style={[s.redeemBtn, isLocked && s.redeemBtnLocked]}
          onPress={() => handleRedeem(product)}
          disabled={isLocked || redeemingId === product.id}
        >
          {redeemingId === product.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[s.redeemBtnText, isLocked && { color: C.muted }]}>
              {isLocked ? 'Locked 🔒' : 'Redeem'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const filtered = coupons.filter(c => c.status === couponTab);

  // ── Camera scanner ────────────────────────────────────────────────────────
  if (isCameraOpen) {
    return (
      <View style={s.cameraContainer}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            setIsCameraOpen(false);
            Alert.alert('Coupon Code', data);
          }}
        />
        <TouchableOpacity style={s.cameraClose} onPress={() => setIsCameraOpen(false)}>
          <Ionicons name="close-circle" size={40} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <GlobalHeader onBack={onBack} />
      {/* ── Header ─────────────────────────────────────────────────── */}
      <LinearGradient colors={[C.greenDark, C.green]} style={s.header}>
        <View style={{ paddingVertical: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff', textAlign: 'center' }}>My Rewards</Text>
        </View>

        {/* ── Points badge (show in rewards tab header) ── */}
        {activeTab === 'rewards' && rewardsData && (
          <View style={s.pointsBadge}>
            <Text style={s.pointsBadgePts}>{rewardsData.points}</Text>
            <Text style={s.pointsBadgeLabel}>Reward Points</Text>
          </View>
        )}

        {/* ── Tab switcher ── */}
        <View style={s.tabSwitcher}>
          {(['coupons', 'rewards'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[s.tabSwitcherBtn, activeTab === tab && s.tabSwitcherActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Ionicons
                name={tab === 'coupons' ? 'pricetag-outline' : 'star-outline'}
                size={15}
                color={activeTab === tab ? C.green : 'rgba(255,255,255,0.7)'}
              />
              <Text style={[s.tabSwitcherText, activeTab === tab && s.tabSwitcherTextActive]}>
                {tab === 'coupons' ? 'My Coupons' : 'Rewards'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ══════════════════ COUPONS TAB ══════════════════ */}
      {activeTab === 'coupons' && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          {user?.role === 'general_user' ? (
            <View style={s.emptyBox}>
              <Ionicons name="lock-closed-outline" size={48} color={C.muted} />
              <Text style={s.emptyTitle}>Coupons are Locked</Text>
              <Text style={s.emptyText}>
                Unlock exclusive coupons by upgrading to a Farmer account.
              </Text>
              <TouchableOpacity style={s.retryBtn} onPress={() => onNavigate?.('profile')}>
                <Text style={s.retryText}>Go to Profile to Upgrade</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Sub-tab: Available / Used */}
              <View style={s.subTabRow}>
                {(['available', 'used'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[s.subTab, couponTab === t && s.subTabActive]}
                    onPress={() => setCouponTab(t)}
                  >
                    <Text style={[s.subTabText, couponTab === t && s.subTabTextActive]}>
                      {t === 'available' ? 'Available' : 'Used'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {couponLoading ? (
                <ActivityIndicator color={C.green} style={{ marginTop: 40 }} />
              ) : couponError ? (
            <View style={s.emptyBox}>
              <Ionicons name="alert-circle-outline" size={40} color={C.red} />
              <Text style={s.emptyText}>{couponError}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={loadCoupons}>
                <Text style={s.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : filtered.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="pricetag-outline" size={48} color={C.muted} />
              <Text style={s.emptyTitle}>No {couponTab} coupons</Text>
              <Text style={s.emptyText}>
                {couponTab === 'available'
                  ? 'Ask your CLSL dealer for a referral code to get exclusive coupons.'
                  : 'Coupons you use will appear here.'}
              </Text>
            </View>
          ) : (
            filtered.map(renderCouponCard)
          )}
            </>
          )}

          <View style={{ height: 30 }} />
        </ScrollView>
      )}

      {/* ══════════════════ REWARDS TAB ══════════════════ */}
      {activeTab === 'rewards' && (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
          {user?.role !== 'farmer' ? (
            <View style={s.emptyBox}>
              <Ionicons name="star-outline" size={48} color={C.muted} />
              <Text style={s.emptyTitle}>Rewards for Farmers</Text>
              <Text style={s.emptyText}>
                Upgrade your account to a farmer profile to start earning reward points.
              </Text>
            </View>
          ) : rewardsLoading ? (
            <ActivityIndicator color={C.green} style={{ marginTop: 40 }} />
          ) : rewardsError ? (
            <View style={s.emptyBox}>
              <Ionicons name="alert-circle-outline" size={40} color={C.red} />
              <Text style={s.emptyText}>{rewardsError}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={loadRewards}>
                <Text style={s.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* How you earn */}
              <Text style={s.sectionTitle}>How you earn</Text>
              <View style={s.earnGrid}>
                {[
                  { icon: 'sunny-outline', color: C.amber, label: 'Daily Login', pts: '+10' },
                  { icon: 'leaf-outline',  color: C.green, label: 'Crop Inspection', pts: '+25' },
                  { icon: 'pricetag-outline', color: C.purple, label: 'Coupon Activity', pts: '+5' },
                ].map(e => (
                  <View key={e.label} style={s.earnCard}>
                    <View style={[s.earnIcon, { backgroundColor: e.color + '18' }]}>
                      <Ionicons name={e.icon as any} size={18} color={e.color} />
                    </View>
                    <Text style={s.earnLabel}>{e.label}</Text>
                    <Text style={[s.earnPts, { color: e.color }]}>{e.pts} pts</Text>
                  </View>
                ))}
              </View>

              {/* Recent activity */}
              {(rewardsData?.activities?.length ?? 0) > 0 && (
                <>
                  <Text style={s.sectionTitle}>Recent Activity</Text>
                  <ScrollView style={{ maxHeight: 200, marginBottom: 20 }} nestedScrollEnabled>
                    <View style={[s.activityCard, { marginBottom: 0 }]}>
                      {(rewardsData!.activities).slice(0, 10).map(renderActivityRow)}
                    </View>
                  </ScrollView>
                </>
              )}

              {/* Reward products */}
              <View style={s.rewardProductsHeader}>
                <Text style={s.sectionTitle}>Redeem Products</Text>
                <Text style={s.rewardProductsHint}>Use your points to unlock free products</Text>
              </View>

              {(rewardsData?.reward_products?.length ?? 0) === 0 ? (
                <View style={[s.emptyBox, { marginTop: 0 }]}>
                  <Ionicons name="gift-outline" size={40} color={C.muted} />
                  <Text style={s.emptyText}>No reward products available right now.</Text>
                </View>
              ) : (
                <View style={s.productsGrid}>
                  {(rewardsData!.reward_products).map(renderProductCard)}
                </View>
              )}

              <View style={{ height: 30 }} />
            </>
          )}
        </ScrollView>
      )}

      {/* ── Coupon detail modal ─────────────────────────────────────── */}
      <Modal visible={!!selectedCoupon} transparent animationType="slide" onRequestClose={() => setSelectedCoupon(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <TouchableOpacity style={s.modalClose} onPress={() => setSelectedCoupon(null)}>
              <Ionicons name="close" size={24} color={C.muted} />
            </TouchableOpacity>
            {selectedCoupon && (
              <>
                <View style={s.modalQR}>
                  <QRCode value={selectedCoupon.code} size={160} />
                </View>
                <Text style={s.modalCode}>{selectedCoupon.code}</Text>
                
                <View style={{ width: '100%', alignItems: 'center', backgroundColor: C.limePale, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginBottom: 16 }}>
                  <Text style={s.modalTitle}>{selectedCoupon.title}</Text>
                  <Text style={[s.modalDiscount, { color: C.green }]}>{selectedCoupon.discount}</Text>
                </View>
                
                {(selectedCoupon.productName || selectedCoupon.description) && (
                  <View style={{ width: '100%', alignItems: 'flex-start', marginBottom: 16 }}>
                    {selectedCoupon.productName && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Ionicons name="flask-outline" size={16} color={C.muted} style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>{selectedCoupon.productName} {selectedCoupon.packing ? `(${selectedCoupon.packing})` : ''}</Text>
                      </View>
                    )}
                    {selectedCoupon.description && (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        <Ionicons name="information-circle-outline" size={16} color={C.muted} style={{ marginRight: 6, marginTop: 2 }} />
                        <Text style={{ fontSize: 13, color: '#4b5563', lineHeight: 18 }}>{selectedCoupon.description}</Text>
                      </View>
                    )}
                  </View>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Ionicons name="time-outline" size={16} color={C.muted} style={{ marginRight: 6 }} />
                  <Text style={s.modalExpiry}>{selectedCoupon.expires}</Text>
                  {selectedCoupon.daysRemaining !== undefined && selectedCoupon.daysRemaining > 0 && selectedCoupon.status === 'available' && (
                    <Text style={{ fontSize: 12, color: C.amber, fontWeight: '700', marginLeft: 6 }}>({selectedCoupon.daysRemaining} days left)</Text>
                  )}
                </View>

                {selectedCoupon.status === 'available' ? (
                  <Text style={s.modalNote}>Show this QR code to your CLSL dealer to redeem your reward during purchase.</Text>
                ) : (
                  <Text style={s.modalNote}>This coupon has already been used.</Text>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  headerTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  scanBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },

  // Points badge in header
  pointsBadge: { alignItems: 'center', marginBottom: 10 },
  pointsBadgePts: { fontSize: 40, fontWeight: '900', color: C.lime, letterSpacing: -1 },
  pointsBadgeLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: -4 },

  // Tab switcher
  tabSwitcher: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12, padding: 4, marginBottom: 0,
  },
  tabSwitcherBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: 9,
  },
  tabSwitcherActive: { backgroundColor: '#fff' },
  tabSwitcherText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  tabSwitcherTextActive: { color: C.green },

  // Sub-tab (available / used)
  subTabRow: {
    flexDirection: 'row', backgroundColor: '#e8f0e1',
    borderRadius: 10, padding: 3, marginBottom: 16,
  },
  subTab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  subTabActive: { backgroundColor: '#fff' },
  subTabText: { fontSize: 13, fontWeight: '600', color: C.muted },
  subTabTextActive: { color: C.ink, fontWeight: '800' },

  // Scan row
  scanRow: { flexDirection: 'row', gap: 10, marginBottom: 16, alignItems: 'center' },
  scanInput: {
    flex: 1, height: 44, backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 14, borderWidth: 1, borderColor: C.line,
    fontSize: 14, color: C.ink, fontWeight: '700',
  },
  scanRowBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: C.green, justifyContent: 'center', alignItems: 'center',
  },

  // Coupon card
  couponCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16,
    marginBottom: 16, borderWidth: 1, borderColor: C.line,
    overflow: 'hidden', position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
    minHeight: 110,
  },
  couponCardUsed: { opacity: 0.65 },
  couponNotchLeft: {
    position: 'absolute', left: 74, top: -10, width: 20, height: 20,
    borderRadius: 10, backgroundColor: C.bg, zIndex: 2,
  },
  couponNotchRight: {
    position: 'absolute', left: 74, bottom: -10, width: 20, height: 20,
    borderRadius: 10, backgroundColor: C.bg, zIndex: 2,
  },
  couponLeft: {
    width: 84, justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1, borderRightColor: C.line, borderStyle: 'dashed',
  },
  couponIconBox: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  couponDivider: { width: 0 },
  couponBody: { flex: 1, padding: 16, justifyContent: 'center' },
  couponTitle: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 4, lineHeight: 19 },
  couponDiscount: { fontSize: 18, fontWeight: '900', marginBottom: 4 },
  couponExpiry: { fontSize: 11, color: C.amber, fontWeight: '700', marginTop: 4 },
  couponRight: { width: 80, justifyContent: 'center', alignItems: 'center', padding: 8 },
  couponQRWrapper: { borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 2 },
  usedBadge: {
    backgroundColor: '#e5e7eb', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  usedBadgeText: { fontSize: 10, fontWeight: '900', color: C.muted, letterSpacing: 1 },

  // Rewards
  pointsSummaryCard: { borderRadius: 18, overflow: 'hidden', marginBottom: 20 },
  pointsSummaryGrad: { padding: 16 },
  pointsSummaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  pointsSummaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  pointsSummaryPts: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -1, lineHeight: 40 },
  pointsSummaryIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  pointsSummaryHint: { fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 18 },

  earnGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  earnCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: C.line, alignItems: 'center', gap: 6,
  },
  earnIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  earnLabel: { fontSize: 11, fontWeight: '700', color: C.ink, textAlign: 'center' },
  earnPts: { fontSize: 13, fontWeight: '900' },

  activityCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, marginBottom: 20 },
  activityRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 10 },
  activityIcon: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  activityBody: { flex: 1 },
  activityLabel: { fontSize: 13, fontWeight: '700', color: C.ink },
  activityDate: { fontSize: 11, color: C.muted, marginTop: 2 },
  activityPoints: { fontSize: 14, fontWeight: '900' },

  rewardProductsHeader: { marginBottom: 4 },
  rewardProductsHint: { fontSize: 12, color: C.muted, marginBottom: 14, marginTop: -8 },

  productsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  productCard: {
    width: (W - 44) / 2, backgroundColor: '#fff', borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: C.line, alignItems: 'center',
  },
  productCardLocked: { borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  productImgBox: {
    width: '100%', height: 90, backgroundColor: C.bg, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
    overflow: 'hidden', position: 'relative',
  },
  productImg: { width: '100%', height: '100%' },
  lockOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center',
  },
  productName: { fontSize: 12, fontWeight: '800', color: C.ink, textAlign: 'center', marginBottom: 8, lineHeight: 16 },
  pointsBar: {
    width: '100%', height: 5, backgroundColor: '#e5e7eb',
    borderRadius: 3, marginBottom: 4, overflow: 'hidden',
  },
  pointsFill: { height: '100%', backgroundColor: C.green, borderRadius: 3 },
  pointsNeeded: { fontSize: 10.5, color: C.muted, fontWeight: '600', marginBottom: 8 },
  redeemBtn: {
    width: '100%', paddingVertical: 8, borderRadius: 9,
    backgroundColor: C.green, alignItems: 'center',
  },
  redeemBtnLocked: { backgroundColor: '#e5e7eb' },
  redeemBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  // Empty state
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: C.ink },
  emptyText: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
  retryBtn: {
    backgroundColor: C.green, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  sectionTitle: { fontSize: 16, fontWeight: '900', color: C.ink, marginBottom: 12 },

  // Camera
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  cameraClose: {
    position: 'absolute', top: 50, right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 25,
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, alignItems: 'center', paddingBottom: 40,
  },
  modalClose: {
    alignSelf: 'flex-end', marginBottom: 12,
    padding: 6, backgroundColor: C.bg, borderRadius: 20,
  },
  modalQR: {
    padding: 12, borderWidth: 1.5, borderColor: C.line,
    borderRadius: 14, marginBottom: 16,
  },
  modalCode: { fontSize: 18, fontWeight: '900', color: C.ink, letterSpacing: 3, marginBottom: 8 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: C.ink, textAlign: 'center', marginBottom: 6 },
  modalDiscount: { fontSize: 22, fontWeight: '900', marginBottom: 4 },
  modalExpiry: { fontSize: 12, color: C.muted, marginBottom: 12 },
  modalNote: { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 17 },
});
