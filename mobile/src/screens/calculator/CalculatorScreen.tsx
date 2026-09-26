import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, MobileScreen, shared } from '../../components/MobileScreen';
import { getCatalogue, CatalogProduct } from '../../services/api';

const CATEGORIES = ['All', 'Fruit', 'Vegetable', 'Cereal', 'Cotton'];

export default function CalculatorScreen({ onBack }: { onBack: () => void }) {
  const [area, setArea] = useState('1');
  const [water, setWater] = useState('150');
  const [dose, setDose] = useState('0');
  const [tank, setTank] = useState('15');
  const [packSize, setPackSize] = useState('0');

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);

  useEffect(() => {
    getCatalogue().then(setProducts).finally(() => setLoading(false));
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
    if (activeCategory !== 'All') {
      const catLower = activeCategory.toLowerCase();
      list = list.filter(p => (p.approvedCrops || []).some((c: string) => Boolean(c?.toLowerCase().includes(catLower))));
    }
    if (!search.trim() && activeCategory === 'All') return [];
    
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(p => Boolean(p.name?.toLowerCase()?.includes(q)) || (p.approvedCrops || []).some((c: string) => Boolean(c?.toLowerCase()?.includes(q))));
    }
    return list.slice(0, 5);
  }, [search, products, activeCategory]);

  const result = useMemo(() => {
    const a = Number(area) || 0;
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
    <MobileScreen title="Spray Calculator" subtitle="Accurate field mixing" onBack={onBack}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        {/* INPUTS */}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Area to treat</Text>
              <TextInput value={area} onChangeText={setArea} style={styles.inputBox} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Area unit</Text>
              <View style={styles.unitBox}>
                <Text style={styles.unitText}>Acre</Text>
              </View>
            </View>
          </View>

          <View style={[styles.inputGroup, { marginTop: 20 }]}>
            <Text style={styles.label}>CLSL product</Text>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity 
                  key={cat} 
                  style={[styles.catBtn, activeCategory === cat && styles.catBtnActive]}
                  onPress={() => setActiveCategory(cat)}
                >
                  <Text style={[styles.catText, activeCategory === cat && styles.catTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput 
              value={search} 
              onChangeText={setSearch} 
              placeholder={selectedProduct ? selectedProduct.name : "Choose a catalogue product..."} 
              placeholderTextColor={selectedProduct ? AppColors.ink : AppColors.muted}
              style={[styles.inputBox, { marginTop: 8 }]} 
            />

            {loading ? <ActivityIndicator color={AppColors.green} style={{ marginTop: 10 }} /> : (
              filteredProducts.length > 0 && (
                <View style={styles.searchResults}>
                  {filteredProducts.map(p => (
                    <TouchableOpacity 
                      key={p.id} 
                      style={styles.searchItem} 
                      onPress={() => {
                        selectProduct(p);
                        setSearch('');
                        setActiveCategory('All');
                      }}
                    >
                      <Text style={styles.searchItemTitle}>{p.name} {p.category && `(${p.category})`}</Text>
                      <Text style={styles.searchItemSub}>Crops: {(p.approvedCrops||[]).slice(0,3).join(', ')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )
            )}
          </View>

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
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E8EEF2' },
  row: { flexDirection: 'row', gap: 16, marginTop: 20 },
  inputGroup: { flex: 1 },
  label: { fontSize: 13, fontWeight: '700', color: '#102A43', marginBottom: 8 },
  inputBox: { backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#102A43', fontWeight: '600' },
  unitBox: { backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'flex-end' },
  unitText: { fontSize: 16, color: '#486581', fontWeight: '600' },
  
  inputWithUnit: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 8, paddingHorizontal: 16 },
  inputFlex: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#102A43', fontWeight: '600' },
  inputUnit: { fontSize: 14, color: '#8294A0', fontWeight: '700' },

  helpText: { fontSize: 12, color: '#8294A0', lineHeight: 18, marginTop: 24 },

  catScroll: { marginBottom: 8 },
  catBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F0F4F8', marginRight: 8 },
  catBtnActive: { backgroundColor: AppColors.greenLight },
  catText: { fontSize: 12, fontWeight: '600', color: AppColors.muted },
  catTextActive: { color: AppColors.green, fontWeight: '800' },

  searchResults: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8EEF2', borderRadius: 8, marginTop: 4, maxHeight: 150 },
  searchItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  searchItemTitle: { fontWeight: '700', color: '#102A43', fontSize: 14 },
  searchItemSub: { fontSize: 11, color: '#8294A0', marginTop: 2 },

  resultCard: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E8EEF2' },
  tankList: { padding: 20 },
  tankItem: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  tankNum: { fontSize: 24, fontWeight: '900', color: '#BCCCDC' },
  tankLabel: { fontSize: 12, fontWeight: '700', color: '#8294A0', textTransform: 'uppercase', letterSpacing: 1 },
  tankMix: { fontSize: 22, fontWeight: '900', color: '#102A43', marginTop: 2 },

  summaryCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E8EEF2' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  summaryBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  summaryLabel: { fontSize: 14, color: '#486581', fontWeight: '600' },
  summaryValue: { fontSize: 16, color: '#102A43', fontWeight: '800' }
});
