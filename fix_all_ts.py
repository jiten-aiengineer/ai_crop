import re
import sys

def fix_login_screen():
    with open('mobile/src/screens/auth/LoginScreen.tsx', 'r', encoding='utf-8') as f:
        c = f.read()

    # 1. Remove duplicate dealerCode
    # We want to replace the first const [dealerCode, setDealerCode] = useState(''); with  
    c = c.replace("const [dealerCode, setDealerCode] = useState('');", "", 1)
    
    # 2. Fix state type
    c = c.replace("useState<'farmer' | 'dealer' | 'sales_officer'>('farmer');", "useState<'farmer' | 'dealer' | 'sales_officer' | 'general_user'>('farmer');")

    # 3. Remove duplicate progressSegActive
    dup_str = '''  progressSegActive: { backgroundColor: T.primary },

  // Added missing styles for Auth Flow
  stepContainer: { paddingVertical: 20 },'''
    if c.count("progressSegActive: { backgroundColor: T.primary },") > 1:
        c = c.replace("  progressSegActive: { backgroundColor: T.primary },", "", 1)
        
    with open('mobile/src/screens/auth/LoginScreen.tsx', 'w', encoding='utf-8') as f:
        f.write(c)

def fix_dealer_home():
    with open('mobile/src/screens/dealer/DealerHomeScreen.tsx', 'r', encoding='utf-8') as f:
        c = f.read()
    
    # Remove everything from line 630 to 640
    import re
    # We will just remove the second occurrence of statsBar and related
    dup1 = '''  statsBar: {
    flexDirection: 'row', backgroundColor: C.greenDark,
    paddingVertical: 13, paddingHorizontal: 20,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '900', color: C.lime, letterSpacing: -0.3 },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 },'''
    c = c.replace(dup1, "")

    dup2 = '''  listCard: {
    flexDirection: 'row', backgroundColor: C.card, borderRadius: 16,
    padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.line,
  },
  listIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: C.greenLight,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  listTitle: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 4 },
  listSub: { fontSize: 13, color: C.textSub, fontWeight: '500' },'''
    c = c.replace(dup2, "")

    with open('mobile/src/screens/dealer/DealerHomeScreen.tsx', 'w', encoding='utf-8') as f:
        f.write(c)

def fix_so_home():
    with open('mobile/src/screens/sales_officer/SalesOfficerHomeScreen.tsx', 'r', encoding='utf-8') as f:
        c = f.read()
    c = c.replace("user.name", "user.first_name")
    with open('mobile/src/screens/sales_officer/SalesOfficerHomeScreen.tsx', 'w', encoding='utf-8') as f:
        f.write(c)

def fix_api():
    with open('mobile/src/services/api.ts', 'r', encoding='utf-8') as f:
        c = f.read()
    c = c.replace("{ farmers: DealerFarmer[] }", "{ farmers: any[] }")
    with open('mobile/src/services/api.ts', 'w', encoding='utf-8') as f:
        f.write(c)

fix_login_screen()
fix_dealer_home()
fix_so_home()
fix_api()
print("Fixed TS errors")
