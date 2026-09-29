import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, MobileScreen, shared } from '../../components/MobileScreen';
import { askMitra } from '../../services/api';
import mascotImage from '../../../assets/images/mascot_v3.png';

type Message = { role: 'user' | 'assistant'; content: string; time: string };

const getTime = () => {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

export default function AssistantScreen({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Namaste! I’m Crop Life Mitra. Ask me about crop symptoms, which product to use, how to order, or weather.', time: getTime() }
  ]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  
  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Message[] = [...messages, { role: 'user', content: q, time: getTime() }];
    setMessages(next);
    setText('');
    setBusy(true);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    
    try {
      const historyPayload = messages.map(m => ({ role: m.role, content: m.content }));
      const response = await askMitra(q, historyPayload, 'English');
      setMessages([...next, { role: 'assistant', content: response.answer || "I'm not sure, could you rephrase?", time: getTime() }]);
    } catch (err) {
      console.error(err);
      setMessages([...next, { role: 'assistant', content: "Sorry, I am having trouble connecting right now. Please check your network and try again.", time: getTime() }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
    
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <MobileScreen title="Crop Life Mitra" subtitle={busy ? "🟢 Online - typing..." : "🟢 Online"} onBack={onBack} scroll={false} headerAvatar={mascotImage}>
      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={styles.messages} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          
          {messages.map((m, i) => (
            <View key={i} style={[styles.row, m.role === 'user' ? styles.rowUser : styles.rowBot]}>
              {m.role === 'assistant' && (
                <View style={styles.avatarContainer}>
                  <Image source={mascotImage} style={styles.avatar} />
                  <View style={styles.onlineDot} />
                </View>
              )}
              <View style={[styles.bubble, m.role === 'user' ? styles.user : styles.bot]}>
                <Text style={[styles.message, m.role === 'user' && styles.userText]}>{m.content}</Text>
                <Text style={[styles.time, m.role === 'user' ? styles.userTime : styles.botTime]}>{m.time}</Text>
              </View>
            </View>
          ))}
          
          {busy && (
            <View style={[styles.row, styles.rowBot]}>
              <View style={styles.avatarContainer}>
                <Image source={mascotImage} style={styles.avatar} />
                <View style={styles.onlineDot} />
              </View>
              <View style={[styles.bubble, styles.bot, styles.typing]}>
                <ActivityIndicator color={AppColors.green} size="small" />
                <Text style={{marginLeft: 6, color: AppColors.green, fontWeight: '600', fontSize: 13}}>typing...</Text>
              </View>
            </View>
          )}
        </ScrollView>
        <View style={styles.composerWrapper}>
          <View style={styles.composer}>
            <TextInput 
              value={text} 
              onChangeText={setText} 
              onSubmitEditing={send} 
              placeholder="Message..." 
              multiline 
              style={styles.input} 
            />
          </View>
          <TouchableOpacity onPress={send} style={styles.send} disabled={!text.trim() || busy}>
            <Ionicons name="send" size={20} color="#FFF" style={{ marginLeft: 3 }} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#EFEAE2' },
  messages: { padding: 12, gap: 12, paddingBottom: 24, paddingTop: 16 },
  
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 2 },
  rowBot: { justifyContent: 'flex-start' },
  rowUser: { justifyContent: 'flex-end' },
  
  avatarContainer: { marginRight: 8, position: 'relative' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D7E4CF' },
  onlineDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#4CAF50', position: 'absolute', bottom: 0, right: -2, borderWidth: 1.5, borderColor: '#EFEAE2' },
  
  bubble: { 
    maxWidth: '82%', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 12, 
    elevation: 1, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 1 
  },
  bot: { alignSelf: 'flex-start', backgroundColor: '#FFF', borderTopLeftRadius: 2 },
  user: { alignSelf: 'flex-end', backgroundColor: '#DCF8C6', borderTopRightRadius: 2 },
  
  message: { fontSize: 15, lineHeight: 20, color: '#111B21', marginBottom: 8 },
  userText: { color: '#111B21' },
  
  time: { fontSize: 10, alignSelf: 'flex-end', marginTop: -8, color: '#667781' },
  userTime: { color: '#54656F' },
  botTime: { color: '#667781' },
  
  typing: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  
  composerWrapper: { flexDirection: 'row', alignItems: 'flex-end', padding: 8, paddingBottom: Platform.OS === 'ios' ? 24 : 8, backgroundColor: '#F0F2F5', gap: 8 },
  composer: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: '#FFF', borderRadius: 22, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, elevation: 1 },
  input: { flex: 1, color: '#111B21', fontSize: 16, padding: 0 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: AppColors.green, alignItems: 'center', justifyContent: 'center', elevation: 1 }
});
