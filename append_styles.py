import re

with open('mobile/src/screens/dealer/DealerHomeScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

missing_styles = """
  // Live stats bar
  statsBarWrapper: { borderRadius: 16, overflow: 'hidden', marginBottom: 24, elevation:2, shadowColor:'#000', shadowOpacity: 0.1, shadowOffset: {width:0, height:2} },
  statsBar: {
    flexDirection: 'row', backgroundColor: C.greenDark,
    paddingVertical: 14, paddingHorizontal: 20,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '900', color: C.lime, letterSpacing: -0.3 },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 },

  // Progress card
  progressCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.line },
  progress: { height:10, backgroundColor:'#DDE8EE', borderRadius:6, overflow:'hidden' },
  progressFill: { height:'100%', backgroundColor:C.green, borderRadius:6 },

  // Lists
  listCard: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  listItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.line },
  listItemMain: { flex: 1, paddingRight: 10 },
  listItemTitle: { fontSize: 14, fontWeight: '800', color: C.ink, marginBottom: 2 },
  listItemSub: { fontSize: 11, color: C.muted, fontWeight: '600' },
  listItemAmount: { alignItems: 'flex-end' },
  listItemVal: { fontSize: 15, fontWeight: '900', color: C.ink, marginBottom: 2 },
  listItemStatus: { fontSize: 10, fontWeight: '700', color: C.amber, textTransform: 'uppercase' },
  emptyList: { padding: 24, textAlign: 'center', color: C.muted, fontSize: 13, fontWeight: '600' },

  // Referral Modal
  modal: { flex:1, backgroundColor:C.bg },
  modalHead: { height:80, backgroundColor:'#FFF', paddingTop: 35, paddingHorizontal:16, flexDirection:'row', alignItems:'center', justifyContent:'space-between', borderBottomWidth:1, borderBottomColor:C.line },
  close: { width:44, height:44, borderRadius:14, backgroundColor:C.pale, alignItems:'center', justifyContent:'center' },
  modalTitle: { fontSize:20, fontWeight:'900', color:C.ink },
  modalBody: { padding:22, alignItems:'center', gap:16 },
  modalLead: { color:C.muted, fontSize:15, lineHeight:22, textAlign:'center' },
  qrLoading: { width:240, height:240, borderRadius:22, backgroundColor:'#FFF', alignItems:'center', justifyContent:'center', gap:12 },
  codeLabel: { color:C.muted, fontSize:11, fontWeight:'900', letterSpacing:1.3 },
  code: { fontSize:34, fontWeight:'900', letterSpacing:5, color:C.green },
  dealerName: { color:C.ink, fontWeight:'800', marginBottom:8 },
  modalActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.green, borderRadius: 12, paddingVertical: 14, gap: 8, width:'100%' },
  modalActionText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Camera scanner
  camOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  camCloseBtn: { position: 'absolute', top: 52, right: 24, backgroundColor: 'rgba(255,255,255,0.2)', padding: 12, borderRadius: 20 },
  camFrame: { width: 250, height: 250, borderWidth: 3, borderColor: C.lime, borderRadius: 20, overflow: 'hidden' },
  camHint: { color: '#fff', marginTop: 24, fontSize: 14, fontWeight: '600' },

  // Scan modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  scannedCard: { backgroundColor: '#FFF', borderRadius: 24, overflow: 'hidden', maxHeight: '92%', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  scannedHeader: { backgroundColor: C.green, padding: 24, alignItems: 'center', gap: 10 },
  scannedIconWrapper: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  scannedTitle: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  scannedBody: { flexShrink: 1 },
  scannedBodyContent: { padding: 28 },
  scannedLabel: { fontSize: 11, color: C.muted, fontWeight: '800', letterSpacing: 0.8 },
  scannedValue: { fontSize: 22, color: C.ink, fontWeight: '900', marginTop: 4, letterSpacing: 2 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 18 },
  scannedOffer: { fontSize: 26, color: C.green, fontWeight: '900', marginTop: 4 },
  criteriaBox: { backgroundColor: '#F0F7FB', padding: 16, borderRadius: 14, marginTop: 24, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: '#DCECF5' },
  criteriaTitle: { color: '#064878', fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  criteriaText: { color: '#0A62A3', fontSize: 14, marginTop: 6, lineHeight: 20, fontWeight: '500' },
  redeemField: { marginTop: 16 },
  redeemFieldLabel: { fontSize: 10, color: C.muted, fontWeight: '900', letterSpacing: 0.7, marginBottom: 7 },
  redeemInput: { borderWidth: 1, borderColor: C.line, backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 13, minHeight: 46, color: C.ink, fontSize: 14 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: { borderWidth: 1, borderColor: C.line, backgroundColor: '#FFF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  choiceChipOn: { borderColor: C.green, backgroundColor: C.pale },
  choiceChipText: { color: C.muted, fontSize: 12, fontWeight: '700' },
  choiceChipTextOn: { color: C.greenDark },
  scannedActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: '#FAFAFA' },
  scannedBtnCancel: { flex: 1, padding: 20, alignItems: 'center', borderRightWidth: 1, borderRightColor: C.line },
  scannedBtnCancelText: { color: C.muted, fontWeight: '800', fontSize: 16 },
  scannedBtnRedeem: { flex: 1, padding: 20, alignItems: 'center', backgroundColor: '#FFF' },
  buttonDisabled: { opacity: 0.55 },
  scannedBtnRedeemText: { color: C.green, fontWeight: '900', fontSize: 16 },
"""

content = re.sub(r'(const s = StyleSheet\.create\({)', r'\1\n' + missing_styles, content)

with open('mobile/src/screens/dealer/DealerHomeScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
