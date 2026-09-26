/**
 * ProductsScreen — Live CLSL product catalogue.
 * Fetches directly from /api/catalogue/live
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, Image, TextInput, Dimensions, ActivityIndicator, Platform, Modal,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getCatalogue, CatalogProduct } from '../../services/api';
import { transformCropList, CROP_CATEGORIES } from '../../utils/crop';
import { BlurView } from 'expo-blur';

const { width: W, height: H } = Dimensions.get('window');
const H_PAD = 16;

const C = {
  green:     '#3e7025',
  greenDark: '#173b1b',
  lime:      '#cbe968',
  limePale:  '#edf3d7',
  ink:       '#1d3322',
  muted:     '#71806d',
  bg:        '#f2f6ed',
  card:      '#ffffff',
  line:      '#d7e4cf',
  pale:      '#eff7df',
  amber:     '#d97706',
};

const CAT_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  'Insecticides':             { bg: '#fff3cd', text: '#856404', dot: '#f0a500' },
  'Fungicides':               { bg: '#d4edda', text: '#155724', dot: '#28a745' },
  'Weedicides':               { bg: '#d1ecf1', text: '#0c5460', dot: '#17a2b8' },
  'Seed Treatment':           { bg: '#e2d9f3', text: '#4a1d8c', dot: '#6f42c1' },
  'Plant Growth Regulator':   { bg: '#e6f7f5', text: '#0d7d72', dot: '#0d7d72' },
  'Bio Stimulant':            { bg: '#d4edda', text: '#155724', dot: '#20c997' },
  'Micro Fertilizers':        { bg: '#cce5ff', text: '#004085', dot: '#007bff' },
  'Sticking Agent':           { bg: '#f8d7da', text: '#721c24', dot: '#dc3545' },
  'Antibiotic / Bactericide': { bg: '#f5c6cb', text: '#721c24', dot: '#e74c3c' },
};
const catStyle = (cat: string) => CAT_COLOR[cat] || { bg: C.limePale, text: C.green, dot: C.green };

function productImageUrl(img: string) {
  if (!img) return '';
  if (img.startsWith('http')) return img;
  if (img.startsWith('/')) return `https://ai.croplifescience.com${img}`;
  return '';
}

const ALL_CATEGORIES = ['All', 'Insecticides', 'Fungicides', 'Weedicides', 'Seed Treatment',
  'Plant Growth Regulator', 'Bio Stimulant', 'Micro Fertilizers', 'Sticking Agent', 'Antibiotic / Bactericide'];

export default function ProductsScreen({ onBack }: { onBack: () => void }) {
  const [products, setProducts]       = useState<CatalogProduct[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);

  useEffect(() => {
    getCatalogue()
      .then(({ items }) => {
        if (items) {
          const processed = items.map((p: any) => ({
            ...p,
            approvedCrops: transformCropList(p.approvedCrops || [])
          }));
          setProducts(processed);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    
    // Check if the user is searching for a category (like "fruit", "vegetables")
    let categorySearchCrops: string[] = [];
    if (q.includes('fruit')) {
      categorySearchCrops = CROP_CATEGORIES['Fruits'].map(c => c.toLowerCase());
    } else if (q.includes('veg')) {
      categorySearchCrops = CROP_CATEGORIES['Vegetables'].map(c => c.toLowerCase());
    } else if (q.includes('cereal') || q.includes('pulse')) {
      categorySearchCrops = CROP_CATEGORIES['Cereals & Pulses'].map(c => c.toLowerCase());
    }

    let results = products.filter(p => {
      const matchCat = activeCategory === 'All' || p.category === activeCategory;
      if (!matchCat) return false;
      if (!q) return true;

      const pCrops = (p.approvedCrops || []).map(c => c.toLowerCase());
      
      const matchSearch = p.name?.toLowerCase()?.includes(q)
        || p.commonName?.toLowerCase()?.includes(q)
        || pCrops.some(c => c?.includes(q))
        || (categorySearchCrops.length > 0 && pCrops.some(c => categorySearchCrops.includes(c)));
        
      return matchSearch;
    });

    // If searching by category, sort by the number of crops that match the category
    if (categorySearchCrops.length > 0) {
      results.sort((a, b) => {
        const aCrops = (a.approvedCrops || []).map(c => c.toLowerCase());
        const bCrops = (b.approvedCrops || []).map(c => c.toLowerCase());
        const aMatches = aCrops.filter(c => categorySearchCrops.includes(c)).length;
        const bMatches = bCrops.filter(c => categorySearchCrops.includes(c)).length;
        return bMatches - aMatches;
      });
    }

    return results;
  }, [products, search, activeCategory]);

  const searchCropMatch = search.trim().toLowerCase();

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.card} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={C.green} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Image source={require('../../../assets/images/clsl-logo.png')} style={s.headerLogo} resizeMode="contain" />
          <Text style={s.headerTitle}>CLSL Products</Text>
        </View>
        <View style={s.headerCount}>
          <Text style={s.headerCountText}>{products.length || 73}+</Text>
        </View>
      </View>

      {/* Search bar */}
      <View style={s.searchRow}>
        <Ionicons name="search-outline" size={18} color={C.muted} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search product, active ingredient or crop..."
          placeholderTextColor={C.muted}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category tabs */}
      <View style={{ height: 55 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
          {ALL_CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[s.catTab, activeCategory === cat && s.catTabActive]}
            onPress={() => setActiveCategory(cat)}
          >
            {cat !== 'All' && (
              <View style={[s.catDot, { backgroundColor: catStyle(cat).dot }]} />
            )}
            <Text style={[s.catTabText, activeCategory === cat && s.catTabTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      </View>

      {/* Product List */}
      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={C.green} />
          <Text style={s.loadingText}>Loading CLSL catalogue...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <Text style={s.resultsCount}>{filtered.length} products {search || activeCategory !== 'All' ? 'found' : 'available'}</Text>

          <View style={s.list}>
            {filtered.map(product => {
              const cs = catStyle(product.category);
              const imgUrl = productImageUrl(product.image);
              
              // Smart crop highlight logic
              const crops = product.approvedCrops || [];
              let displayCrops = crops;
              let hasMore = false;
              let matchedCrop = '';
              
              if (searchCropMatch) {
                matchedCrop = crops.find((c: string) => c.toLowerCase().includes(searchCropMatch)) || '';
              }
              
              if (matchedCrop) {
                displayCrops = [matchedCrop];
                if (crops.length > 1) hasMore = true;
              } else {
                displayCrops = crops.slice(0, 3);
                if (crops.length > 3) hasMore = true;
              }

              return (
                <TouchableOpacity key={product.id} style={s.listCard} activeOpacity={0.7} onPress={() => setSelectedProduct(product)}>
                  {/* Image Left */}
                  <View style={s.listImgBox}>
                    {imgUrl ? (
                      <Image source={{ uri: imgUrl }} style={s.listImg} resizeMode="contain" />
                    ) : (
                      <MaterialCommunityIcons name="bottle-tonic-outline" size={44} color={C.green} />
                    )}
                  </View>

                  {/* Content Right */}
                  <View style={s.listContent}>
                    <View style={[s.catBadge, { backgroundColor: cs.bg }]}>
                      <View style={[s.catBadgeDot, { backgroundColor: cs.dot }]} />
                      <Text style={[s.catBadgeText, { color: cs.text }]} numberOfLines={1}>{product.category}</Text>
                    </View>

                    <Text style={s.productName} numberOfLines={1}>{product.name}</Text>
                    {!!product.commonName && (
                      <Text style={s.productCommon} numberOfLines={1}>{product.commonName}</Text>
                    )}

                    {/* Crops */}
                    {crops.length > 0 && (
                      <View style={s.cropRow}>
                        {displayCrops.map((c: string) => (
                          <View key={c} style={[s.cropPill, c === matchedCrop && s.cropPillHighlight]}>
                            <Text style={[s.cropPillText, c === matchedCrop && s.cropPillTextHighlight]} numberOfLines={1}>{c}</Text>
                          </View>
                        ))}
                        {hasMore && (
                          <Text style={s.cropMore}>+{(crops.length - displayCrops.length)} more</Text>
                        )}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Product Details Modal */}
      <Modal
        visible={!!selectedProduct}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedProduct(null)}
      >
        {selectedProduct && (
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <TouchableOpacity onPress={() => setSelectedProduct(null)} style={s.modalCloseBtn}>
                  <Ionicons name="close" size={24} color={C.ink} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalScroll}>
                <View style={s.modalImgBox}>
                  {productImageUrl(selectedProduct.image) ? (
                    <Image source={{ uri: productImageUrl(selectedProduct.image) }} style={s.modalImg} resizeMode="contain" />
                  ) : (
                    <MaterialCommunityIcons name="bottle-tonic-outline" size={80} color={C.green} />
                  )}
                </View>

                <View style={s.modalBody}>
                  <View style={[s.catBadge, { backgroundColor: catStyle(selectedProduct.category).bg, alignSelf: 'center', marginBottom: 12, paddingHorizontal: 10, paddingVertical: 5 }]}>
                    <View style={[s.catBadgeDot, { backgroundColor: catStyle(selectedProduct.category).dot }]} />
                    <Text style={[s.catBadgeText, { color: catStyle(selectedProduct.category).text, fontSize: 12 }]}>{selectedProduct.category}</Text>
                  </View>

                  <Text style={s.modalTitle}>{selectedProduct.name}</Text>
                  {!!selectedProduct.commonName && (
                    <Text style={s.modalSubtitle}>{selectedProduct.commonName}</Text>
                  )}

                  <View style={s.modalDivider} />

                  {!!selectedProduct.dose && (
                    <View style={s.infoRow}>
                      <Ionicons name="flask-outline" size={20} color={C.green} style={s.infoIcon} />
                      <View style={s.infoTextCol}>
                        <Text style={s.infoLabel}>Recommended Dose</Text>
                        <Text style={s.infoVal}>{selectedProduct.dose}</Text>
                      </View>
                    </View>
                  )}




                  
                  {!!selectedProduct.useBenefits && (
                    <View style={s.infoRow}>
                      <Ionicons name="star-outline" size={20} color={C.green} style={s.infoIcon} />
                      <View style={s.infoTextCol}>
                        <Text style={s.infoLabel}>Use & Benefits</Text>
                        <Text style={s.infoVal}>{selectedProduct.useBenefits}</Text>
                      </View>
                    </View>
                  )}

                  <View style={s.modalDivider} />

                  <Text style={s.sectionTitle}>Supported Crops</Text>
                  <View style={s.modalCropsGrid}>
                    {(selectedProduct.approvedCrops || []).length > 0 ? (
                      selectedProduct.approvedCrops!.map((c: string) => (
                        <View key={c} style={s.modalCropPill}>
                          <Ionicons name="leaf-outline" size={14} color={C.green} />
                          <Text style={s.modalCropText}>{c}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={s.infoVal}>No specific crops listed.</Text>
                    )}
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card,
    paddingHorizontal: H_PAD,
    paddingTop: Platform.OS === 'ios' ? 52 : 38,
    paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.limePale, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLogo: { width: 30, height: 30 },
  headerTitle: { fontSize: 17, fontWeight: '900', color: C.ink },
  headerCount: { backgroundColor: C.limePale, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  headerCountText: { fontSize: 12, fontWeight: '800', color: C.green },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.card, paddingHorizontal: H_PAD, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.ink, fontWeight: '500' },

  // Category tabs
  catRow: { paddingHorizontal: H_PAD, paddingVertical: 10, gap: 8, backgroundColor: C.card },
  catTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 22, backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.line,
  },
  catTabActive: { backgroundColor: C.green, borderColor: C.green },
  catDot: { width: 7, height: 7, borderRadius: 4 },
  catTabText: { fontSize: 12.5, fontWeight: '600', color: C.muted },
  catTabTextActive: { color: '#fff', fontWeight: '800' },

  // Loading
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  loadingText: { fontSize: 14, color: C.muted, fontWeight: '600' },

  scroll: { paddingHorizontal: H_PAD, paddingTop: 16 },
  resultsCount: { fontSize: 12.5, fontWeight: '700', color: C.muted, marginBottom: 14 },

  // List (Single Column)
  list: { gap: 14 },
  listCard: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 12,
    borderWidth: 1, borderColor: C.line,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
  },
  listImgBox: {
    width: 90, height: 100,
    backgroundColor: '#ffffff',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 14,
  },
  listImg: { width: '100%', height: '100%' },
  listContent: { flex: 1, justifyContent: 'center' },

  catBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    alignSelf: 'flex-start', marginBottom: 8,
  },
  catBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  catBadgeText: { fontSize: 10, fontWeight: '800' },

  productName: { fontSize: 16, fontWeight: '900', color: C.ink, marginBottom: 4 },
  productCommon: { fontSize: 12, color: C.muted, marginBottom: 10 },

  cropRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  cropPill: { backgroundColor: C.limePale, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  cropPillHighlight: { backgroundColor: C.green },
  cropPillText: { fontSize: 10.5, fontWeight: '700', color: C.green },
  cropPillTextHighlight: { color: '#fff' },
  cropMore: { fontSize: 10.5, fontWeight: '700', color: C.muted },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    height: H * 0.85,
    overflow: 'hidden',
  },
  modalHeader: {
    position: 'absolute', top: 16, right: 16, zIndex: 10,
  },
  modalCloseBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
  },
  modalScroll: {
    paddingBottom: 40,
  },
  modalImgBox: {
    width: '100%', height: 260,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: C.line,
    paddingVertical: 20,
  },
  modalImg: {
    width: '90%', height: '100%',
  },
  modalBody: {
    padding: 24,
  },
  modalTitle: {
    fontSize: 24, fontWeight: '900', color: C.ink, textAlign: 'center', marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14, color: C.muted, textAlign: 'center', marginBottom: 16,
  },
  modalDivider: {
    height: 1, backgroundColor: C.line, marginVertical: 20,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 16,
  },
  infoIcon: {
    marginTop: 2,
  },
  infoTextCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  infoVal: {
    fontSize: 14, color: C.ink, lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: '800', color: C.ink, marginBottom: 16,
  },
  modalCropsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  modalCropPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
  },
  modalCropText: {
    fontSize: 13, fontWeight: '600', color: C.ink,
  },
});
