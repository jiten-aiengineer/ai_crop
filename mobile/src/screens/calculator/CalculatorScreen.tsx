import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View, ScrollView, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, MobileScreen, shared } from '../../components/MobileScreen';
import { getCatalogue, CatalogProduct } from '../../services/api';

// Removed categories

export default function CalculatorScreen({ onBack }: { onBack: () => void }) {
  const [area, setArea] = useState('1');
  const [areaUnit, setAreaUnit] = useState('Acre');
  const [showUnitDrop, setShowUnitDrop] = useState(false);
  const [water, setWater] = useState('150');
  const [dose, setDose] = useState('0');
  const [tank, setTank] = useState('15');
  const [packSize, setPackSize] = useState('0');

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return ['All', ...Array.from(cats)] as string[];
  }, [products]);

  useEffect(() => {
    getCatalogue().then(res => setProducts(res.items || [])).finally(() => setLoading(false));
  }, []);

  const selectProduct = (p: CatalogProduct) => {
    setSelectedProduct(p);
    const match = p.dose?.match(/(\d+)/);
    if (match) {
      setDose(match[1]);
    }
  };

  const filteredProducts = useMemo(() => {
    let list = products;
    if (!search.trim() && !isDropdownOpen) return [];
    
    if (selectedCategory !== 'All') {
      list = list.filter(p => p.category === selectedCategory);
    }
    
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(p => Boolean(p.name?.toLowerCase()?.includes(q)) || (p.approvedCrops || []).some((c: string) => Boolean(c?.toLowerCase()?.includes(q))));
    }
    return list.slice(0, 20);
  }, [search, products, isDropdownOpen, selectedCategory]);

  const result = useMemo(() => {
    let a = Number(area) || 0;
    if (areaUnit === 'Hectare') a = a * 2.47105;
    if (areaUnit === 'Bigha') a = a * 0.4;
    const w = Number(water) || 0;
    const d = Number(dose) || 0;
    const t = Number(tank) || 1;
    const pSize = Number(packSize) || 1;

    const totalWater = a * w;
    const totalProduct = a * d;
    const tanks = Math.ceil(totalWater / t);
    
    let perTank = 0;
    let finalWater = 0;
    let finalMix = 0;
    let fullTanks = 0;

    if (totalWater > 0 && t > 0) {
      perTank = totalProduct / (totalWater / t);
      fullTanks = Math.floor(totalWater / t);
      finalWater = totalWater % t;
      if (finalWater > 0) {
        finalMix = (finalWater / t) * perTank;
      }
    }

    const packs = pSize > 0 ? Math.ceil(totalProduct / pSize) : 0;

    return { 
      totalWater, 
      totalProduct, 
      tanks, 
      fullTanks,
      perTank,
      finalWater,
      finalMix,
      packs
    };
  }, [area, water, dose, tank, packSize]);

  return (
    <MobileScreen title="Spray Calculator (Updated)" subtitle="Accurate field mixing" onBack={onBack}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        {/* INPUTS */}
        <View style={styles.card}>
          <View style={[styles.row, { zIndex: 20 }]}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Area to treat</Text>
              <TextInput value={area} onChangeText={setArea} style={styles.inputBox} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Area unit</Text>
              <TouchableOpacity style={[styles.inputBox, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]} onPress={() => setShowUnitDrop(!showUnitDrop)}>
                <Text style={{ fontSize: 16, color: '#102A43', fontWeight: '600' }}>{areaUnit}</Text>
                <Ionicons name="chevron-down" size={18} color="#8294A0" />
              </TouchableOpacity>
              {showUnitDrop && (
                <View style={styles.unitDrop}>
                  {['Acre', 'Hectare', 'Bigha'].map(u => (
                    <TouchableOpacity key={u} style={styles.unitDropItem} onPress={() => { setAreaUnit(u); setShowUnitDrop(false); }}>
                      <Text style={[styles.inputFlex, areaUnit === u && { color: AppColors.green }]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          </View>

          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>CLSL product</Text>
              
              <TouchableOpacity 
                style={styles.productSelectorBtn} 
                onPress={() => setIsDropdownOpen(true)}
              >
                {selectedProduct ? (
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: AppColors.ink }}>{selectedProduct.name}</Text>
                    <Text style={{ fontSize: 12, color: AppColors.muted, marginTop: 2 }}>{selectedProduct.category}</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 16, color: AppColors.muted, flex: 1 }}>Select a product...</Text>
                )}
                <Ionicons name="search" size={20} color={AppColors.green} />
              </TouchableOpacity>
            </View>

          <Modal visible={isDropdownOpen} animationType="slide" onRequestClose={() => setIsDropdownOpen(false)}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setIsDropdownOpen(false)} style={{ padding: 8 }}>
                  <Ionicons name="close" size={28} color={AppColors.ink} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Select Product</Text>
                <View style={{ width: 44 }} />
              </View>

              <View style={styles.modalSearchBox}>
                <Ionicons name="search" size={20} color={AppColors.muted} />
                <TextInput 
                  value={search} 
                  onChangeText={setSearch} 
                  placeholder="Search by name, crop, or category..." 
                  style={styles.modalSearchInput}
                  autoFocus 
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <Ionicons name="close-circle" size={20} color={AppColors.muted} />
                  </TouchableOpacity>
                )}
              </View>

              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 10 }}>
                  {categories.map(c => (
                    <TouchableOpacity 
                      key={c} 
                      onPress={() => setSelectedCategory(c)}
                      style={[styles.categoryPill, selectedCategory === c && styles.categoryPillActive]}
                    >
                      <Text style={[styles.categoryPillText, selectedCategory === c && styles.categoryPillTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
                {loading ? <ActivityIndicator color={AppColors.green} size="large" style={{ marginTop: 40 }} /> : 
                 filteredProducts.length === 0 ? (
                  <Text style={{ textAlign: 'center', marginTop: 40, color: AppColors.muted, fontSize: 16 }}>No products found.</Text>
                ) : (
                  filteredProducts.map(p => (
                    <TouchableOpacity 
                      key={p.id} 
                      style={styles.modalProductItem} 
                      onPress={() => {
                        selectProduct(p);
                        setIsDropdownOpen(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalProductName}>{p.name}</Text>
                        <Text style={styles.modalProductCat}>{p.category} • {p.formulation}</Text>
                        <Text style={styles.modalProductCrops} numberOfLines={1}>{p.approvedCrops?.join(', ')}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={AppColors.muted} />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </Modal>

          <View style={styles.row}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Approved dose per acre</Text>
              <View style={styles.inputWithUnit}>
                <TextInput value={dose} onChangeText={setDose} style={styles.inputFlex} keyboardType="decimal-pad" />
                <Text style={styles.inputUnit}>ml</Text>
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Water per acre</Text>
              <View style={styles.inputWithUnit}>
                <TextInput value={water} onChangeText={setWater} style={styles.inputFlex} keyboardType="decimal-pad" />
                <Text style={styles.inputUnit}>L/ac</Text>
              </View>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Pump size</Text>
              <View style={styles.inputWithUnit}>
                <TextInput value={tank} onChangeText={setTank} style={styles.inputFlex} keyboardType="decimal-pad" />
                <Text style={styles.inputUnit}>L</Text>
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Pack size</Text>
              <View style={styles.inputWithUnit}>
                <TextInput value={packSize} onChangeText={setPackSize} style={styles.inputFlex} keyboardType="decimal-pad" />
                <Text style={styles.inputUnit}>ml</Text>
              </View>
            </View>
          </View>
          
          <Text style={styles.helpText}>
            Enter the approved per-acre dose from the label. Exact single-value catalogue doses may be prefilled; always confirm them.
          </Text>
        </View>

        {/* RESULTS - TANK MIX */}
        <View style={styles.resultCard}>
          <View style={styles.tankList}>
            {result.fullTanks > 0 && (
              <View style={styles.tankItem}>
                <Text style={styles.tankNum}>01</Text>
                <View>
                  <Text style={styles.tankLabel}>full tank</Text>
                  <Text style={styles.tankMix}>{tank} L + {result.perTank.toFixed(1)} ml</Text>
                </View>
              </View>
            )}
            
            {result.finalWater > 0 && (
              <View style={[styles.tankItem, { borderTopWidth: 1, borderTopColor: '#E8EEF2', paddingTop: 16 }]}>
                <Text style={styles.tankNum}>02</Text>
                <View>
                  <Text style={styles.tankLabel}>final tank</Text>
                  <Text style={styles.tankMix}>{result.finalWater.toFixed(1)} L + {result.finalMix.toFixed(1)} ml</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* RESULTS - SUMMARY */}
        <View style={styles.summaryCard}>
          <SummaryRow label="Product required" value={`${result.totalProduct.toFixed(1)} ml`} />
          <SummaryRow label="Water required" value={`${result.totalWater.toFixed(0)} L`} />
          <SummaryRow label="Pump loads" value={`${result.tanks}`} />
          <SummaryRow label="Product / full tank" value={`${result.perTank.toFixed(1)} ml`} />
          <SummaryRow label="Final tank mix" value={`${result.finalMix.toFixed(1)} ml`} />
          <SummaryRow label="Packs to buy" value={`${result.packs}`} isLast />
        </View>

        <View style={{height: 50}} />
      </ScrollView>
    </MobileScreen>
  );
}

function SummaryRow({ label, value, isLast }: { label: string, value: string, isLast?: boolean }) {
  return (
    <View style={[styles.summaryRow, !isLast && styles.summaryBorder]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  row: { flexDirection: 'row', gap: 16, marginTop: 20 },
  inputGroup: { flex: 1 },
  label: { fontSize: 13, fontWeight: '700', color: '#102A43', marginBottom: 8 },
  inputBox: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8EEF2', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16, fontSize: 16, color: '#102A43', fontWeight: '800' },
  
  unitDrop: { position: 'absolute', top: 90, left: 0, right: 0, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#D9E2EC', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 10, zIndex: 30 },
  unitDropItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  
  inputWithUnit: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8EEF2', borderRadius: 12, paddingHorizontal: 16 },
  inputFlex: { flex: 1, paddingVertical: 16, fontSize: 16, color: '#102A43', fontWeight: '800' },
  inputUnit: { fontSize: 14, color: '#8294A0', fontWeight: '700' },

  helpText: { fontSize: 12, color: '#8294A0', lineHeight: 18, marginTop: 24 },

  // Product Selector Button
  productSelectorBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8EEF2' },
  
  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: '#F8FBF3' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 60, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E8EEF2' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: AppColors.ink },
  modalSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', margin: 16, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E8EEF2', height: 50 },
  modalSearchInput: { flex: 1, marginLeft: 12, fontSize: 16, color: AppColors.ink },
  
  categoryPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 24, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8EEF2' },
  categoryPillActive: { backgroundColor: AppColors.green, borderColor: AppColors.green },
  categoryPillText: { fontSize: 14, fontWeight: '700', color: AppColors.muted },
  categoryPillTextActive: { color: '#FFF' },
  
  modalProductItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: '#E8EEF2' },
  modalProductName: { fontSize: 16, fontWeight: '800', color: AppColors.ink },
  modalProductCat: { fontSize: 13, color: AppColors.muted, marginTop: 4, fontWeight: '600' },
  modalProductCrops: { fontSize: 12, color: AppColors.muted, marginTop: 2 },

  resultCard: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  tankList: { padding: 20 },
  tankItem: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  tankNum: { fontSize: 24, fontWeight: '900', color: '#BCCCDC' },
  tankLabel: { fontSize: 12, fontWeight: '700', color: '#8294A0', textTransform: 'uppercase', letterSpacing: 1 },
  tankMix: { fontSize: 22, fontWeight: '900', color: '#102A43', marginTop: 2 },

  summaryCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  summaryBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  summaryLabel: { fontSize: 14, color: '#486581', fontWeight: '600' },
  summaryValue: { fontSize: 16, color: '#102A43', fontWeight: '800' }
});
