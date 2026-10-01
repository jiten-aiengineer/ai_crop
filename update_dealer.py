import re

def update_file():
    with open('mobile/src/screens/dealer/DealerHomeScreen.tsx', 'r') as f:
        content = f.read()
    
    # 1. Update top bar
    old_top_bar = """      {/* Top bar */}
      <View style={s.topBar}>
        <View style={s.topBarHeader}>
          <View style={s.topBarLeft}>
            <Image
              source={require('../../../assets/images/clsl-logo-leaf.png')}
              style={s.topBarLogo}
              resizeMode="contain"
            />
            <View>
              <Text style={s.topBarBrand}>CLSL Dealer</Text>
              <Text style={s.topBarTagline}>{dashboard?.dealer.name || user?.dealer_name || 'Partner Portal'}</Text>
            </View>
          </View>
          <View style={s.topBarRight}>
            <TouchableOpacity style={s.topBarBtn} onPress={() => setShowNotifications(!showNotifications)}>
              <Ionicons name="notifications-outline" size={22} color={C.ink} />
              <View style={s.notifDot} />
            </TouchableOpacity>
          </View>
        </View>
      </View>"""

    new_top_bar = """      {/* Top bar */}
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
              <Text style={s.topBarTagline}>{dashboard?.dealer.name || user?.dealer_name || 'Crop care, made smarter.'}</Text>
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
      </View>"""
    
    content = content.replace(old_top_bar, new_top_bar)

    # 2. Update hero banner
    old_hero_badge = """              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                <View style={[s.heroBadge, { marginBottom: 0 }]}>
                  <Ionicons name="people" size={10} color={C.lime} />
                  <Text style={s.heroBadgeText}>REFER & EARN</Text>
                </View>
              </View>"""
    
    new_hero_badge = """              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
                <View style={[s.heroBadge, { marginBottom: 0 }]}>
                  <Ionicons name="people" size={10} color={C.lime} />
                  <Text style={s.heroBadgeText}>REFER & EARN</Text>
                </View>
                {user?.district && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999 }}>
                    <Ionicons name="location-outline" size={10} color={C.lime} />
                    <Text style={{ fontSize: 8.5, color: '#fff', marginLeft: 2, fontWeight: '700' }}>{user.district}</Text>
                  </View>
                )}
              </View>"""
    
    content = content.replace(old_hero_badge, new_hero_badge)
    
    # 3. Update greeting
    old_greeting = """<Text style={{ fontSize: 12, color: C.lime, fontWeight: '700', marginBottom: 2 }}>Welcome, {user?.first_name || 'Partner'} 👋</Text>"""
    new_greeting = """<Text style={{ fontSize: 11, color: C.lime, fontWeight: '700', marginBottom: 2 }}>Welcome, {user?.first_name || 'Partner'} 👋</Text>"""
    content = content.replace(old_greeting, new_greeting)

    with open('mobile/src/screens/dealer/DealerHomeScreen.tsx', 'w') as f:
        f.write(content)

update_file()
