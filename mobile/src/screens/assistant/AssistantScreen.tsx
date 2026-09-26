import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, MobileScreen, shared } from '../../components/MobileScreen';
import { getCatalogue, CatalogProduct } from '../../services/api';
import mascotImage from '../../../assets/images/mascot_new.png'; // This asset might not exist, but let's assume it does since it was in the original code. Wait, the original code had: import mascotImage from '../../../assets/images/mascot_new.png';

type Message = { role: 'user' | 'assistant'; content: string };

export default function AssistantScreen({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Namaste! I’m Crop Life Mitra. Ask me about crop symptoms, which product to use, how to order, or weather.' }
  ]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  
  // Local catalog for offline answers
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  useEffect(() => {
    getCatalogue().then(setProducts).catch(console.error);
  }, []);

  const getLocalAnswer = (q: string): string => {
    const query = q.toLowerCase();
    
    if (query.includes('call') || query.includes('order') || query.includes('contact') || query.includes('buy') || query.includes('number')) {
      return "To place an order or for any product doubts, please contact your local sales representative or call our National Support Line at +91-1800-123-4567. You can also email us at sales@croplifescience.com.";
    }
    
    if (query.includes('weather') || query.includes('rain')) {
      return "For live weather updates and spraying advice, please check the 'Field Weather' tab on the home screen. It will tell you if it's safe to spray right now.";
    }

    if (query.includes('coupon') || query.includes('reward')) {
      return "Registered farmers can access promotional coupons in the 'Rewards' section. Make sure your profile is upgraded to a Farmer account!";
    }

    if (query.includes('hi ') || query.includes('hello') || query.includes('namaste')) {
      return "Hello! How can I help you with your crops today?";
    }

    // Try to find a matching product by crop or pest name
    const matches = products.filter(p => {
      const inName = Boolean(p.name?.toLowerCase()?.includes(query)) || Boolean(p.commonName?.toLowerCase()?.includes(query));
      const inCrops = (p.approvedCrops || []).some((c: string) => Boolean(c?.toLowerCase()?.includes(query)));
      const inDesc = Boolean(p.useBenefits?.toLowerCase()?.includes(query));
      return inName || inCrops || inDesc;
    });

    if (matches.length > 0) {
      const top = matches.slice(0, 3);
      const names = top.map(p => `• ${p.name} (${p.category || 'Product'}): ${p.dose || 'Check label'}`).join('\n');
      return `Based on your question, here are some CLSL products that might help:\n\n${names}\n\nPlease check the product catalog for detailed packing and safety information.`;
    }

    return "I'm still learning! Could you provide a specific crop name or pest name? Or ask me about 'how to order' or 'weather'.";
  };

  const send = () => {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...messages, { role: 'user' as const, content: q }];
    setMessages(next);
    setText('');
    setBusy(true);
    
    // Simulate thinking delay for better UX (so the user sees the mascot typing)
    setTimeout(() => {
      const answer = getLocalAnswer(q);
      setMessages([...next, { role: 'assistant', content: answer }]);
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }, 1200);
    
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <MobileScreen title="Crop Life Mitra" subtitle="Instant Local Support" onBack={onBack} scroll={false}>
      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={styles.messages} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          
          {messages.map((m, i) => (
            <View key={i} style={[styles.row, m.role === 'user' ? styles.rowUser : styles.rowBot]}>
              {m.role === 'assistant' && (
                <Image source={mascotImage} style={styles.avatar} />
              )}
              <View style={[styles.bubble, m.role === 'user' ? styles.user : styles.bot]}>
                <Text style={[styles.message, m.role === 'user' && styles.userText]}>{m.content}</Text>
              </View>
            </View>
          ))}
          
          {busy && (
            <View style={[styles.row, styles.rowBot]}>
              <Image source={mascotImage} style={styles.avatar} />
              <View style={[styles.bubble, styles.bot, styles.typing]}>
                <ActivityIndicator color={AppColors.green} size="small" />
                <Text style={[shared.body, {marginLeft: 6, color: AppColors.green, fontWeight: '700'}]}>Mitra is typing...</Text>
              </View>
            </View>
          )}
        </ScrollView>
        <View style={styles.composer}>
          <TextInput 
            value={text} 
            onChangeText={setText} 
            onSubmitEditing={send} 
            placeholder="E.g. What should I spray for tomato?" 
            multiline 
            style={styles.input} 
          />
          <TouchableOpacity onPress={send} style={styles.send}>
            <Ionicons name="send" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, marginHorizontal: -16, marginVertical: -14, backgroundColor: '#F8F9FA' },
  messages: { padding: 16, gap: 16, paddingBottom: 24, paddingTop: 24 },
  
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
  rowBot: { justifyContent: 'flex-start' },
  rowUser: { justifyContent: 'flex-end' },
  
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: AppColors.lineLight },
  
  bubble: { maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 20 },
  bot: { alignSelf: 'flex-start', backgroundColor: '#FFF', borderWidth: 1, borderColor: AppColors.lineLight, borderBottomLeftRadius: 6 },
  user: { alignSelf: 'flex-end', backgroundColor: AppColors.green, borderBottomRightRadius: 6 },
  
  message: { fontSize: 15, lineHeight: 22, color: AppColors.ink },
  userText: { color: '#FFF' },
  
  typing: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, padding: 12, paddingBottom: Platform.OS === 'ios' ? 24 : 12, borderTopWidth: 1, borderTopColor: AppColors.line, backgroundColor: '#FFF' },
  input: { flex: 1, maxHeight: 108, minHeight: 48, borderRadius: 24, backgroundColor: '#F0F4F8', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14, color: AppColors.ink, fontSize: 15 },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: AppColors.green, alignItems: 'center', justifyContent: 'center' }
});
