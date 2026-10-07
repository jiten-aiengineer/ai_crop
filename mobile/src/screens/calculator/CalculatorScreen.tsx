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
  const [packSize, setPackSize] = useState('');
  const [showFormula, setShowFormula] = useState(false);

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
    const pSize = Number(packSize) || 0;

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
    <MobileScreen title="Spray Calculator" subtitle="Accurate field mixing" onBack={onBack}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        {/* INPUTS */}
        <View style={shared.card}>
          <View style={[styles.row, { zIndex: 20, marginTop: 0 }]}>
            <View style={styles.inputGroup}>
              <Text style={shared.label}>Area to treat</Text>
              <TextInput value={area} onChangeText={setArea} style={shared.input} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={shared.label}>Area unit</Text>
              <TouchableOpacity style={[shared.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]} onPress={() => setShowUnitDrop(!showUnitDrop)}>
                <Text style={{ fontSize: 15, color: AppColors.ink }}>{areaUnit}</Text>
                <Ionicons name="chevron-down" size={18} color={AppColors.muted} />
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
          
          <View style={{ height: 16 }} />
          
          <View style={styles.inputGroup}>
            <Text style={shared.label}>CLSL product</Text>
            
            <TouchableOpacity 
              style={styles.productSelectorBtn} 
              onPress={() => setIsDropdownOpen(true)}
            >
              {selectedProduct ? (
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: AppColors.ink }}>{selectedProduct.name}</Text>
                  <Text style={{ fontSize: 12, color: AppColors.muted, marginTop: 2 }}>{selectedProduct.category}</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 15, color: AppColors.muted, flex: 1 }}>Select a product...</Text>
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
              <Text style={shared.label}>Dose per acre</Text>
              <View style={styles.inputWithUnit}>
                <TextInput value={dose} onChangeText={setDose} style={styles.inputFlex} keyboardType="decimal-pad" />
                <Text style={styles.inputUnit}>ml</Text>
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={shared.label}>Water per acre</Text>
              <View style={styles.inputWithUnit}>
                <TextInput value={water} onChangeText={setWater} style={styles.inputFlex} keyboardType="decimal-pad" />
                <Text style={styles.inputUnit}>L/ac</Text>
              </View>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.inputGroup}>
              <Text style={shared.label}>Pump size</Text>
              <View style={styles.inputWithUnit}>
                <TextInput value={tank} onChangeText={setTank} style={styles.inputFlex} keyboardType="decimal-pad" />
                <Text style={styles.inputUnit}>L</Text>
              </View>
            </View>
          </View>
          
          <Text style={styles.helpText}>
            Enter the approved per-acre dose from the label. Exact catalogue doses may be prefilled; always confirm them.
          </Text>
        </View>
        <View style={{ height: 16 }} />

        {/* RESULTS - TANK MIX */}
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Ionicons name="water" size={24} color={AppColors.green} />
            <Text style={styles.resultHeaderTitle}>Tank Mix Guide</Text>
          </View>
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
              <View style={[styles.tankItem, { borderTopWidth: 1, borderTopColor: AppColors.lineLight, paddingTop: 16 }]}>
                <Text style={styles.tankNum}>02</Text>
                <View>
                  <Text style={styles.tankLabel}>FINAL TANK</Text>
                  <Text style={styles.tankMix}>{result.finalWater.toFixed(1)} L + {result.finalMix.toFixed(1)} ml</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* RESULTS - SUMMARY */}
        <View style={styles.summaryCard}>
          <SummaryRow label="Total Product" value={`${result.totalProduct.toFixed(1)} ml`} />
          <SummaryRow label="Total Water" value={`${result.totalWater.toFixed(0)} L`} />
          <SummaryRow label="Total Pump Loads" value={`${result.tanks}`} />
          
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: AppColors.bg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={[shared.label, { marginBottom: 2 }]}>Buying Packets?</Text>
                <Text style={{ fontSize: 11, color: AppColors.muted }}>Enter pack size to estimate required packets</Text>
              </View>
              <View style={[styles.inputWithUnit, { width: 120, minHeight: 40 }]}>
                <TextInput value={packSize} onChangeText={setPackSize} placeholder="e.g. 500" style={[styles.inputFlex, { paddingVertical: 8, fontSize: 14 }]} keyboardType="decimal-pad" />
                <Text style={styles.inputUnit}>ml</Text>
              </View>
            </View>
            {result.packs > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, backgroundColor: AppColors.pale, padding: 12, borderRadius: 12 }}>
                <Text style={{ fontSize: 14, color: AppColors.greenDark, fontWeight: '700' }}>Estimated packets to buy:</Text>
                <Text style={{ fontSize: 18, color: AppColors.greenDark, fontWeight: '900' }}>{result.packs}</Text>
              </View>
            )}
          </View>
        </View>

        {/* FORMULA SECTION */}
        <TouchableOpacity style={styles.formulaBtn} onPress={() => setShowFormula(true)}>
          <Text style={styles.formulaText}>
            The above calculations are done logically using proper <Text style={{ color: AppColors.green, fontWeight: '700' }}>formula</Text>.
          </Text>
        </TouchableOpacity>

        <View style={{height: 50}} />
      </ScrollView>

      <Modal visible={showFormula} animationType="slide" transparent={true} onRequestClose={() => setShowFormula(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={[styles.modalHeader, { paddingTop: 16 }]}>
              <Text style={styles.modalTitle}>Calculation Formula</Text>
              <TouchableOpacity onPress={() => setShowFormula(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={AppColors.ink} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={shared.body}>The spray calculator uses standard agricultural formulas to ensure accurate field mixing:</Text>
              
              <Text style={[shared.label, { marginTop: 16 }]}>Total Water Required</Text>
              <Text style={styles.formulaCode}>Area × Water per acre</Text>

              <Text style={[shared.label, { marginTop: 16 }]}>Total Product Required</Text>
              <Text style={styles.formulaCode}>Area × Dose per acre</Text>

              <Text style={[shared.label, { marginTop: 16 }]}>Product per Pump (Full Tank)</Text>
              <Text style={styles.formulaCode}>Total Product ÷ (Total Water ÷ Pump Size)</Text>

              <Text style={[shared.label, { marginTop: 16 }]}>Final Partial Tank (If any)</Text>
              <Text style={styles.formulaCode}>Remaining Water × (Product per Pump ÷ Pump Size)</Text>
              
              <TouchableOpacity style={[shared.primary, { marginTop: 24 }]} onPress={() => setShowFormula(false)}>
                <Text style={shared.primaryText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  row: { flexDirection: 'row', gap: 12, marginTop: 16 },
  inputGroup: { flex: 1 },
  unitDrop: { position: 'absolute', top: 56, left: 0, right: 0, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: AppColors.lineLight, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 10, zIndex: 30 },
  unitDropItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: AppColors.bg },
  
  inputWithUnit: { flexDirection: 'row', alignItems: 'center', backgroundColor: AppColors.bgAlt, borderWidth: 1, borderColor: AppColors.line, borderRadius: 14, paddingHorizontal: 14, minHeight: 48 },
  inputFlex: { flex: 1, paddingVertical: 12, fontSize: 15, color: AppColors.ink },
  inputUnit: { fontSize: 13, color: AppColors.muted, fontWeight: '700' },

  helpText: { fontSize: 12, color: AppColors.muted, lineHeight: 18, marginTop: 20 },

  // Product Selector Button
  productSelectorBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 48, backgroundColor: AppColors.bgAlt, borderRadius: 14, borderWidth: 1, borderColor: AppColors.line },
  
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
  
  modalProductItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: AppColors.lineLight },
  modalProductName: { fontSize: 16, fontWeight: '800', color: AppColors.ink },
  modalProductCat: { fontSize: 13, color: AppColors.muted, marginTop: 4, fontWeight: '600' },
  modalProductCrops: { fontSize: 12, color: AppColors.muted, marginTop: 2 },

  resultCard: { backgroundColor: '#FFF', borderRadius: 18, marginBottom: 16, elevation: 2, shadowColor: AppColors.greenDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, borderWidth: 1, borderColor: AppColors.lineLight },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: AppColors.lineLight },
  resultHeaderTitle: { fontSize: 16, fontWeight: '800', color: AppColors.green },
  tankList: { padding: 20, paddingTop: 10 },
  tankItem: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  tankNum: { fontSize: 28, fontWeight: '900', color: AppColors.pale },
  tankLabel: { fontSize: 11, fontWeight: '800', color: AppColors.muted, letterSpacing: 1 },
  tankMix: { fontSize: 22, fontWeight: '900', color: AppColors.ink, marginTop: 2 },

  summaryCard: { backgroundColor: AppColors.card, borderRadius: 18, padding: 18, elevation: 2, shadowColor: AppColors.greenDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, borderWidth: 1, borderColor: AppColors.lineLight },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  summaryBorder: { borderBottomWidth: 1, borderBottomColor: AppColors.bg },
  summaryLabel: { fontSize: 14, color: AppColors.muted, fontWeight: '600' },
  summaryValue: { fontSize: 15, color: AppColors.ink, fontWeight: '800' },

  formulaBtn: { marginTop: 12, paddingHorizontal: 8 },
  formulaText: { fontSize: 13, color: AppColors.muted, textAlign: 'center', lineHeight: 20 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, minHeight: 300, paddingBottom: 20 },
  formulaCode: { backgroundColor: AppColors.pale, color: AppColors.greenDark, padding: 12, borderRadius: 8, fontSize: 14, fontWeight: '600', fontFamily: 'monospace', overflow: 'hidden' }
});
