import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  Platform, 
  FlatList,
  ActivityIndicator,
  Keyboard,
  Modal,
  Alert,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  StatusBar
} from 'react-native';

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Markdown from 'react-native-markdown-display';
import { Clipboard as ClipboardIcon, Settings, Copy, Bot, Monitor, Menu, Trash2 } from 'lucide-react-native';
import EventSource from 'react-native-sse';
import * as ExpoClipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { getBackendURL } from './login';

type Theme = 'Electric Blue' | 'Hacker Matrix' | 'Cyberpunk Pink';
const THEMES = {
  'Electric Blue': { Accent: '#0A84FF', Surface: '#1E1E1E', Background: '#121212' },
  'Hacker Matrix': { Accent: '#00FF66', Surface: '#142417', Background: '#0A0F0B' },
  'Cyberpunk Pink': { Accent: '#FF007F', Surface: '#261420', Background: '#12090F' }
};

type Persona = 'Standard' | 'Rubber Duck' | 'Sassy Senior Dev' | 'Socratic TA' | 'Complexity Analyzer';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  type?: 'text' | 'terminal';
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

const DynamicLoader = () => {
  const [index, setIndex] = useState(0);
  const strings = ["Analyzing query...", "Scanning core memory...", "Formulating logic...", "Generating code..."];
  useEffect(() => {
    const id = setInterval(() => {
      setIndex(prev => (prev + 1) % strings.length);
    }, 800);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ alignItems: 'center', padding: 8 }}>
      <Text style={{ color: '#888', fontStyle: 'italic', fontSize: 12 }}>{strings[index]}</Text>
    </View>
  );
};

const CustomCodeBlock = React.memo(({ children, language, themeColors, backendURL }: { children: React.ReactNode, language?: string, themeColors: any, backendURL: string }) => {
  const content = children ? children.toString().trim() : '';

  const handleCopy = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await ExpoClipboard.setStringAsync(content);
  };

  const [sentStatus, setSentStatus] = useState("Copy to Laptop");

  const handleSendToLaptop = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const response = await fetch(`${backendURL}/clipboard/write`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: content })
      });
      if (response.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSentStatus("Sent!");
        setTimeout(() => setSentStatus("Copy to Laptop"), 2000);
      }
    } catch (e) {
      console.error(e);
      setSentStatus("Failed");
      setTimeout(() => setSentStatus("Copy to Laptop"), 2000);
    }
  };

  return (
    <View style={{ backgroundColor: themeColors.Surface, borderRadius: 8, marginVertical: 8, overflow: 'hidden', borderWidth: 1, borderColor: themeColors.Accent + '40' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#00000040', padding: 8, alignItems: 'center' }}>
        <Text style={{ color: themeColors.Accent, fontWeight: 'bold', fontSize: 12, textTransform: 'uppercase' }}>{language || 'code'}</Text>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity onPress={handleSendToLaptop} style={{ marginRight: 15, flexDirection: 'row', alignItems: 'center' }}>
            <Monitor color={themeColors.Accent} size={14} />
            <Text style={{ color: themeColors.Accent, fontSize: 12, marginLeft: 4 }}>{sentStatus}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleCopy} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Copy color={themeColors.Accent} size={14} />
            <Text style={{ color: themeColors.Accent, fontSize: 12, marginLeft: 4 }}>Copy</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ padding: 10 }}>
        <Text style={{ color: '#FFF', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{content}</Text>
      </View>
    </View>
  );
});

const MessageBubble = React.memo(({ item, themeColors, styles, backendURL }: { item: Message, themeColors: any, styles: any, backendURL: string }) => {
  const isUser = item.role === 'user';
  const isError = item.content.startsWith("[ERROR]");
  
  const markdownRules = {
    fence: (node: any, children: any, parent: any, _styles: any) => (
      <CustomCodeBlock key={node.key} language={node.sourceInfo} themeColors={themeColors} backendURL={backendURL}>{node.content}</CustomCodeBlock>
    ),
    code_block: (node: any, children: any, parent: any, _styles: any) => (
      <CustomCodeBlock key={node.key} themeColors={themeColors} backendURL={backendURL}>{node.content}</CustomCodeBlock>
    )
  };

  const markdownStyles = StyleSheet.create({
    body: { color: '#FFF', fontSize: 16, lineHeight: 22 },
    code_inline: { backgroundColor: themeColors.Surface, color: themeColors.Accent, borderRadius: 4, padding: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    paragraph: { marginVertical: 4 },
  });

  if (item.type === 'terminal') {
    return (
      <View style={[{ alignSelf: 'flex-start', borderBottomLeftRadius: 4 }, styles.messageBubble, { backgroundColor: '#0D1117', borderColor: '#30363D', borderWidth: 1 }]}>
        <Text style={{ color: '#3FB950', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14 }}>
          {item.content}
        </Text>
      </View>
    );
  }
  
  return (
    <View style={[styles.messageBubble, isUser ? { alignSelf: 'flex-end', backgroundColor: themeColors.Accent, borderBottomRightRadius: 4 } : { alignSelf: 'flex-start', backgroundColor: themeColors.Surface, borderBottomLeftRadius: 4 }]}>
      {isUser ? (
        <View>
          <Text style={styles.messageText}>{item.content}</Text>
        </View>
      ) : isError ? (
        <Text style={{ color: '#ff453a', fontSize: 16 }}>{item.content}</Text>
      ) : (
        <Markdown rules={markdownRules} style={markdownStyles}>{item.content}</Markdown>
      )}
    </View>
  );
}, (prevProps, nextProps) => prevProps.item.content === nextProps.item.content && prevProps.item.type === nextProps.item.type && prevProps.themeColors === nextProps.themeColors);



const ChatScreen = () => {
  const router = useRouter();
  const [backendURL, setBackendURL] = useState<string | null>(null);
  const [isLoadingPairing, setIsLoadingPairing] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasReceivedFirstChunk, setHasReceivedFirstChunk] = useState(false);
  
  const [currentTheme, setCurrentTheme] = useState<Theme>('Electric Blue');
  const [currentPersona, setCurrentPersona] = useState<Persona>('Standard');
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);
  const [coreMemory, setCoreMemory] = useState<string[]>([]);
  const [userRole, setUserRole] = useState('Student');

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebarAnim = useRef(new Animated.Value(-300)).current;

  const abortControllerRef = useRef<AbortController | null>(null);
  const eventSourceRef = useRef<any>(null);

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setIsLoading(false);
  };


  const themeColors = THEMES[currentTheme];

  // Voice Dictation is now fully delegated to the native OS keyboard.

  const flatListRef = useRef<FlatList>(null);
  const isScrolledUp = useRef(false);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 50;
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    isScrolledUp.current = !isAtBottom;
  };

  useEffect(() => {
    async function loadConnection() {
      const savedUrl = await SecureStore.getItemAsync('backend_url');
      if (savedUrl) {
        setBackendURL(savedUrl);
      }
      setIsLoadingPairing(false);
    }
    loadConnection();
    loadSessions();
  }, []);

  useEffect(() => {
    if (isSettingsModalVisible) {
      fetchCoreMemory();
    }
  }, [isSettingsModalVisible]);
  
  useEffect(() => {
    const fetchRole = async () => {
      try {
        const role = await SecureStore.getItemAsync('user_role');
        if (role) setUserRole(role);
      } catch (e) {}
    };
    fetchRole();
  }, []);
  
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      saveCurrentSession(currentSessionId, messages);
    }
  }, [messages, currentSessionId]);

  const loadSessions = async () => {
    try {
      const stored = await AsyncStorage.getItem('@chat_sessions');
      if (stored) {
        const parsed: ChatSession[] = JSON.parse(stored);
        setSessions(parsed);
        if (parsed.length > 0) {
          setCurrentSessionId(parsed[0].id);
          setMessages(parsed[0].messages);
        } else {
          createNewSession();
        }
      } else {
        createNewSession();
      }
    } catch (e) {
      createNewSession();
    }
  };

  const saveCurrentSession = async (id: string, msgs: Message[]) => {
    try {
      setSessions(prev => {
        const existing = prev.find(s => s.id === id);
        const title = existing?.title || (msgs[0]?.content.substring(0, 30) || 'New Chat');
        const updatedSession = { id, title, messages: msgs };
        
        let newSessions;
        if (existing) {
          newSessions = prev.map(s => s.id === id ? updatedSession : s);
        } else {
          newSessions = [updatedSession, ...prev];
        }
        AsyncStorage.setItem('@chat_sessions', JSON.stringify(newSessions));
        return newSessions;
      });
    } catch (e) {}
  };

  const createNewSession = () => {
    const newId = Date.now().toString();
    setCurrentSessionId(newId);
    setMessages([]);
    setIsSidebarOpen(false);
    toggleSidebar(false);
  };

  const switchSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      setCurrentSessionId(id);
      setMessages(session.messages);
    }
    toggleSidebar(false);
  };

  const deleteSession = async (id: string) => {
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    await AsyncStorage.setItem('@chat_sessions', JSON.stringify(newSessions));
    if (currentSessionId === id) {
      if (newSessions.length > 0) {
        switchSession(newSessions[0].id);
      } else {
        createNewSession();
      }
    }
  };

  const toggleSidebar = (forceClose = false) => {
    const toValue = (isSidebarOpen || forceClose) ? -300 : 0;
    Animated.timing(sidebarAnim, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setIsSidebarOpen(!(isSidebarOpen || forceClose));
  };

  const fetchCoreMemory = async () => {
    try {
      const session_token = await SecureStore.getItemAsync('session_token');
      if (session_token) {
        const response = await fetch(`${backendURL}/memory`, {
          headers: { 'session-token': session_token }
        });
        if (response.ok) {
          const data = await response.json();
          setCoreMemory(data.memory_list || (data.memory_text ? data.memory_text.split('\n') : []));
        }
      }
    } catch (e) {}
  };




  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    let finalMessage = text;
    let finalPersona = currentPersona;
    let isCommand = false;

    if (finalMessage.startsWith('/run ')) {
      isCommand = true;
      finalMessage = finalMessage.replace('/run ', '');
    } else if (finalMessage.startsWith('/complexity ')) {
      finalPersona = 'Complexity Analyzer';
      finalMessage = finalMessage.replace('/complexity ', '');
    }

    const userMessage: Message = { id: Date.now().toString() + '-user', role: 'user', content: finalMessage };
    const aiMessageId = (Date.now() + 1).toString() + '-ai';
    const initialAiMessage: Message = { id: aiMessageId, role: 'ai', content: '', type: isCommand ? 'terminal' : 'text' };
    
    const newMessagesForState = [...messages, userMessage, initialAiMessage];
    setMessages(newMessagesForState);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    setInputText('');
    setIsLoading(true);
    setHasReceivedFirstChunk(false);

    try {
      const host = await SecureStore.getItemAsync('host');
      const session_token = await SecureStore.getItemAsync('session_token');

      if (!host || !session_token) {
        throw new Error("Missing connection credentials. Please reconnect.");
      }

      abortControllerRef.current = new AbortController();
      const finalApiMessage = finalMessage;

      // Convert messages to Ollama format
      const apiMessages = messages.map(m => {
        return {
          role: m.role === 'ai' ? 'assistant' : m.role,
          content: m.content
        };
      });
      
      apiMessages.push({ role: 'user', content: finalApiMessage });

      const es = new EventSource(`${backendURL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // session-token removed since hardware lockdown is bypassed for chat
        },
        ...(abortControllerRef.current ? { signal: abortControllerRef.current.signal } : {}),
        body: JSON.stringify({
          messages: apiMessages,
          persona: finalPersona,
          is_command: isCommand,
          role: userRole
        })
      });
      eventSourceRef.current = es;

      es.addEventListener('message', (event) => {
        if (event.data === "[DONE]") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          es.close();
          setIsLoading(false);
          setHasReceivedFirstChunk(true);
          return;
        }

        if (event.data && event.data.startsWith("[ERROR]")) {
          setMessages(prevMessages => {
            const newMessages = [...prevMessages];
            const lastIndex = newMessages.length - 1;
            newMessages[lastIndex] = {
              ...newMessages[lastIndex],
              content: event.data || ""
            };
            return newMessages;
          });
          es.close();
          setIsLoading(false);
          setHasReceivedFirstChunk(true);
          return;
        }

        if (event.data) {
          try {
            const data = JSON.parse(event.data);
            if (data.error) {
              setMessages(prev => 
                prev.map(m => m.id === aiMessageId ? { ...m, content: m.content + `\n\nError: ${data.error}` } : m)
              );
              es.close();
              setIsLoading(false);
              setHasReceivedFirstChunk(true);
              return;
            }
            if (data.chunk) {
              setHasReceivedFirstChunk(true);
              setMessages(prevMessages => {
                const newMessages = [...prevMessages];
                const lastIndex = newMessages.length - 1;
                newMessages[lastIndex] = {
                  ...newMessages[lastIndex],
                  content: newMessages[lastIndex].content + data.chunk
                };
                return newMessages;
              });
            } else if (data.type === 'terminal' && data.output !== undefined) {
              setHasReceivedFirstChunk(true);
              setMessages(prevMessages => {
                const newMessages = [...prevMessages];
                const lastIndex = newMessages.length - 1;
                newMessages[lastIndex] = {
                  ...newMessages[lastIndex],
                  content: newMessages[lastIndex].content + data.output + '\n',
                  type: 'terminal'
                };
                return newMessages;
              });
            }
          } catch (e) {
            console.error("SSE Parse Error:", e);
          }
        }
      });

      es.addEventListener('error', (event: any) => {
        console.error("SSE Error:", event);
        es.close();
        setIsLoading(false);
        setHasReceivedFirstChunk(true);
      });

      es.addEventListener('close', () => {
        es.close();
        setIsLoading(false);
        setHasReceivedFirstChunk(true);
      });

    } catch (error: any) {
      setMessages(prev => 
        prev.map(m => m.id === aiMessageId ? { ...m, content: m.content + `Error: ${error.message}` } : m)
      );
      setIsLoading(false);
      setHasReceivedFirstChunk(true);
    }
  };

  const handlePasteFromLaptop = async () => {
    try {
      const res = await fetch(`${backendURL}/clipboard/read`);
      const data = await res.json();
      if (data.status === 'success' && data.content) {
        // Append the laptop's clipboard text to whatever the user is currently typing
        setInputText((prev) => prev + (prev.length > 0 ? '\n' : '') + data.content);
      } else {
        Alert.alert('Clipboard is empty or inaccessible.');
      }
    } catch (err) {
      Alert.alert('Failed to connect to laptop clipboard. Check network.');
    }
  };



  const renderItem = useCallback(({ item }: { item: Message }) => {
    return <MessageBubble item={item} themeColors={themeColors} styles={styles} backendURL={backendURL!} />;
  }, [themeColors, backendURL]);

  if (isLoadingPairing) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D1117', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0A84FF" />
      </View>
    );
  }

  if (!backendURL) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D1117', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: '#FFF', fontSize: 18, textAlign: 'center', marginBottom: 20 }}>
          Laptop not paired. Scan the QR code on your laptop to connect to the AI.
        </Text>
        <TouchableOpacity 
          style={{ backgroundColor: '#0A84FF', padding: 15, borderRadius: 8 }}
          onPress={() => router.replace('/scanner')}
        >
          <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Scan QR Code</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0D1117' }}>
      
      {/* Sidebar Overlay */}
      <Animated.View 
        style={[styles.sidebar, { transform: [{ translateX: sidebarAnim }], backgroundColor: themeColors.Surface }]}
        pointerEvents={isSidebarOpen ? 'auto' : 'none'}
      >
        <View style={styles.sidebarHeader}>
          <Text style={[styles.sidebarTitle, { color: themeColors.Accent }]}>Sessions</Text>
          <TouchableOpacity onPress={createNewSession}>
            <Text style={{ color: themeColors.Accent, fontWeight: 'bold' }}>+ New</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={sessions}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.sessionItem, currentSessionId === item.id && { backgroundColor: themeColors.Accent + '20' }]} onPress={() => switchSession(item.id)}>
              <Text style={{ color: '#FFF', flex: 1 }} numberOfLines={1}>{item.title}</Text>
              <TouchableOpacity onPress={() => deleteSession(item.id)} style={{ padding: 5 }}>
                <Trash2 color="#ff453a" size={16} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      </Animated.View>

      {/* Main Content */}
      <View style={{ paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }}>
        <View style={[styles.topBar, { backgroundColor: themeColors.Surface }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => toggleSidebar()} style={{ marginRight: 15 }}>
            <Menu color={themeColors.Accent} size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>CodeAmigo</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>

          <TouchableOpacity onPress={() => setIsSettingsModalVisible(true)}>
            <Settings color={themeColors.Accent} size={24} />
          </TouchableOpacity>
        </View>
      </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1, display: 'flex', flexDirection: 'column' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <FlatList
          style={{ flex: 1 }}
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (!isScrolledUp.current) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
        />

        {isLoading && !hasReceivedFirstChunk && <DynamicLoader />}

        <View style={{ flexShrink: 0 }}>
          <View style={[styles.inputArea, { backgroundColor: themeColors.Surface, flexDirection: 'column', alignItems: 'stretch' }]}>

              <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                <TextInput
                  style={[styles.textInput, { backgroundColor: themeColors.Background }]}
                  placeholder="Ask CodeAmigo..."
                  placeholderTextColor="#888"
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                />
                <View style={styles.buttonsContainer}>
                  <TouchableOpacity style={styles.iconButton} onPress={handlePasteFromLaptop} disabled={isLoading}>
                    <Text style={{ fontSize: 20 }}>📋</Text>
                  </TouchableOpacity>
                  {isLoading ? (
                    <TouchableOpacity style={[styles.sendButton, { backgroundColor: '#FF453A' }]} onPress={stopGeneration}>
                      <Text style={styles.sendButtonText}>Stop</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.sendButton, { backgroundColor: themeColors.Accent }]} onPress={sendMessage}>
                      <Text style={styles.sendButtonText}>Send</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
        </View>
      </KeyboardAvoidingView>

      {/* Settings Modal */}
      <Modal visible={isSettingsModalVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setIsSettingsModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalContent, { backgroundColor: themeColors.Surface, borderColor: themeColors.Accent }]}>
                <Text style={[styles.modalTitle, { color: themeColors.Accent }]}>Settings</Text>
                
                <Text style={styles.modalLabel}>Persona</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15 }}>
                  {(['Standard', 'Rubber Duck', 'Sassy Senior Dev', 'Socratic TA', 'Complexity Analyzer'] as Persona[]).map(p => (
                    <TouchableOpacity key={p} style={[styles.modalOption, currentPersona === p && { backgroundColor: themeColors.Accent + '40' }, { marginRight: 10 }]} onPress={() => { setCurrentPersona(p); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                      <Text style={{ color: currentPersona === p ? themeColors.Accent : '#FFF' }}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalLabel}>Theme</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15 }}>
                  {(['Electric Blue', 'Hacker Matrix', 'Cyberpunk Pink'] as Theme[]).map(t => (
                    <TouchableOpacity key={t} style={[styles.modalOption, currentTheme === t && { backgroundColor: themeColors.Accent + '40' }, { marginRight: 10 }]} onPress={() => { setCurrentTheme(t); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                      <Text style={{ color: currentTheme === t ? THEMES[t].Accent : '#FFF' }}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalLabel}>AI Core Memory</Text>
                <ScrollView style={{ maxHeight: 150, backgroundColor: themeColors.Background, borderRadius: 8, padding: 10 }}>
                  {coreMemory.length > 0 ? (
                    coreMemory.map((item, index) => (
                      <Text key={index} style={{ color: '#FFF', marginBottom: 4 }}>• {item}</Text>
                    ))
                  ) : (
                    <Text style={{ color: '#888', fontStyle: 'italic' }}>No core memories saved.</Text>
                  )}
                </ScrollView>

              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  chatContainer: {
    padding: 15,
    paddingBottom: 16,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
  },
  messageText: {
    color: '#FFF',
    fontSize: 16,
    lineHeight: 22,
  },
  inputArea: {
    flexDirection: 'row',
    padding: 10,
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    color: '#FFF',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 40,
    maxHeight: 120,
    fontSize: 16,
  },
  quickActionScroll: {
    marginBottom: 10,
  },
  quickActionChip: {
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  quickActionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  buttonsContainer: {
    flexDirection: 'row',
    marginLeft: 10,
    alignItems: 'center',
    marginBottom: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 5,
    borderRadius: 20,
  },
  sendButton: {
    borderRadius: 20,
    width: 60,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  telemetryBar: {
    paddingVertical: 4,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  telemetryText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  modalOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 4,
  },
  memoryInput: {
    height: 120,
    borderRadius: 8,
    padding: 10,
    textAlignVertical: 'top',
    marginBottom: 15,
  },
  saveMemoryButton: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveMemoryButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 300,
    zIndex: 100,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 20,
    borderRightWidth: 1,
    borderColor: '#333',
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sidebarTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    borderRadius: 8,
  }
});

export default ChatScreen;
