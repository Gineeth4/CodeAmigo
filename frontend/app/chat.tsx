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
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  StatusBar,
  Dimensions,
  Pressable,
  ActionSheetIOS,
  SectionList
} from 'react-native';

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Markdown from 'react-native-markdown-display';
import { Clipboard as ClipboardIcon, Settings, Copy, Bot, Monitor, Menu, Trash2, ArrowDownCircle, User, Fingerprint, CheckCircle } from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import EventSource from 'react-native-sse';
import * as ExpoClipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { getBackendURL } from './login';
import { Swipeable, ScrollView } from 'react-native-gesture-handler';

const getThemeAccent = (themeName: string) => {
  switch (themeName) {
    case 'Monokai': return '#A6E22E'; // Neon Green
    case 'Dracula': return '#BD93F9'; // Purple
    case 'One Dark': 
    default: return '#61AFEF'; // CodeAmigo Blue
  }
};

type Theme = 'Dracula' | 'One Dark' | 'Monokai';
const THEMES = {
  'Dracula': { Accent: '#FF79C6', Surface: '#282A36', Background: '#1E1F29' },
  'One Dark': { Accent: '#61AFEF', Surface: '#282C34', Background: '#1E2227' },
  'Monokai': { Accent: '#A6E22E', Surface: '#272822', Background: '#1E1F1C' }
};

const detectLanguage = (title: string) => {
  const t = title.toLowerCase();
  if (t.includes('python') || t.includes('.py')) return 'PY';
  if (t.includes('javascript') || t.includes('react') || t.includes('.js') || t.includes('.jsx')) return 'JS';
  if (t.includes('typescript') || t.includes('.ts') || t.includes('.tsx')) return 'TS';
  if (t.includes('go ') || t.includes('.go')) return 'GO';
  if (t.includes('java ') || t.includes('.java')) return 'JAVA';
  if (t.includes('c++') || t.includes('.cpp')) return 'C++';
  if (t.includes('rust') || t.includes('.rs')) return 'RS';
  return 'TXT';
};

const ROLE_FEATURES: Record<string, { title: string; desc: string }[]> = {
  "Student": [
    { title: "Code Explainer", desc: "Breaks down complex logic step-by-step." },
    { title: "Debug Buddy", desc: "Finds and explains errors in assignments." },
    { title: "Study Notes", desc: "Summarizes dense technical topics." },
    { title: "Quiz Mode", desc: "Tests your knowledge before exams." }
  ],
  "Developer": [
    { title: "Boilerplate Gen", desc: "Writes startup code and templates fast." },
    { title: "Refactor Pro", desc: "Cleans up and optimizes messy code." },
    { title: "Bug Hunter", desc: "Spots logic flaws in your architecture." },
    { title: "API Architect", desc: "Helps design clean REST/GraphQL endpoints." }
  ],
  "Tech Lead": [
    { title: "Arch Review", desc: "Evaluates system design and scalability." },
    { title: "Code Quality", desc: "Enforces strict project coding standards." },
    { title: "Sprint Planner", desc: "Breaks down large epics into tasks." },
    { title: "Security Scan", desc: "Identifies potential vulnerabilities." }
  ],
  "DevOps & Cloud": [
    { title: "CI/CD Builder", desc: "Writes automated deployment pipelines." },
    { title: "Infra-as-Code", desc: "Generates Terraform & Docker configs." },
    { title: "Log Analyzer", desc: "Translates cryptic server logs." },
    { title: "Cost Optimizer", desc: "Suggests AWS/Cloud cost savings." }
  ],
  "Standard": [
    { title: "General Assistant", desc: "Answers general programming queries." },
    { title: "Code Generation", desc: "Writes basic code blocks." },
    { title: "Brainstorming", desc: "Helps formulate ideas." },
    { title: "Problem Solving", desc: "Assists with debugging." }
  ]
};

const formatMessageText = (text: string) => {
  if (!text) return text;
  
  // 1. Convert block math \[ \] to standard markdown code blocks
  let formatted = text.replace(/\\\[(.*?)\\\]/gs, '```math\n$1\n```');
  
  // 2. Convert inline math \( \) to inline code backticks
  formatted = formatted.replace(/\\\((.*?)\\\)/gs, '`$1`');
  
  // 3. Fix completely missing spaces (e.g., "to0" -> "to 0", "summing10" -> "summing 10")
  // We require at least 2 letters ([a-zA-Z]{2,}) to avoid breaking single-letter variables like "x1" or "v2".
  formatted = formatted.replace(/([a-zA-Z]{2,})(\d+)/g, '$1 $2');
  
  // 4. Fix React Native font space collapse
  // Forces a non-breaking space (\u00A0) anywhere a word is followed by a space and a number
  formatted = formatted.replace(/([a-zA-Z]+)\s+(\d+)/g, '$1\u00A0$2');
  
  return formatted;
};

type Persona = 'Standard' | 'Rubber Duck' | 'Sassy Senior Dev' | 'Socratic TA' | 'Complexity Analyzer';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  type?: 'text' | 'terminal' | 'agent_intercept' | 'agent_proceed' | 'agent_done';
  originalPrompt?: string; // NEW FIELD
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

const TypingIndicator = ({ themeColors }: { themeColors: any }) => {
  const opacityAnim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0.4, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, []);
  return (
    <View style={[styles.messageBubble, { alignSelf: 'flex-start', backgroundColor: themeColors.Surface, borderBottomLeftRadius: 2 }]}>
      <Animated.Text style={{ color: '#888', fontStyle: 'italic', fontSize: 16, opacity: opacityAnim }}>CodeAmigo is typing...</Animated.Text>
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
    <View style={{ backgroundColor: '#050505', borderRadius: 8, marginVertical: 8, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(77, 168, 218, 0.3)' }}>
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

const MessageBubble = React.memo(({ item, themeColors, styles, backendURL, onLongPressBubble, handleAgentAction }: { item: Message, themeColors: any, styles: any, backendURL: string, onLongPressBubble?: (content: string) => void, handleAgentAction?: (messageId: string, action: 'skip' | 'proceed_prompt' | 'execute') => void }) => {
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
    code_inline: { backgroundColor: '#1E1E1E', color: themeColors.Accent, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    paragraph: { marginVertical: 4 },
  });

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onLongPressBubble) {
      onLongPressBubble(item.content);
    }
  };


  if (item.type === 'agent_proceed') {
    return (
      <View style={[styles.messageBubble, { alignSelf: 'flex-start', backgroundColor: 'rgba(234, 179, 8, 0.2)', borderColor: '#EAB308', borderWidth: 1, borderBottomLeftRadius: 2, padding: 16 }]}>
        <Text style={{ color: '#FDE047', fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>⚠️ Action Required</Text>
        <Text style={{ color: '#FFF', fontSize: 14, marginBottom: 16 }}>Make sure your cursor is actively placed in your laptop's codespace before proceeding.</Text>
        <TouchableOpacity style={{ backgroundColor: '#EAB308', padding: 12, borderRadius: 8, alignItems: 'center' }} onPress={() => handleAgentAction && handleAgentAction(item.id, 'execute')}>
          <Text style={{ color: '#000', fontWeight: 'bold' }}>🚀 Proceed</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (item.type === 'terminal') {
    return (
      <View style={[{ alignSelf: 'flex-start', borderBottomLeftRadius: 2 }, styles.messageBubble, { backgroundColor: '#0D1117', borderColor: '#30363D', borderWidth: 1 }]}>
        <Text style={{ color: '#3FB950', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14 }}>
          {item.content}
        </Text>
      </View>
    );
  }
  
  return (
    <Pressable 
      onLongPress={handleLongPress}
      delayLongPress={250}
      style={[styles.messageBubble, isUser ? { alignSelf: 'flex-end', backgroundColor: themeColors.Accent, borderBottomRightRadius: 2 } : { alignSelf: 'flex-start', backgroundColor: themeColors.Surface, borderBottomLeftRadius: 2 }]}
    >
      {isUser ? (
        <View>
          <Text style={styles.messageText}>{item.content}</Text>
        </View>
      ) : isError ? (
        <Text style={{ color: '#ff453a', fontSize: 16 }}>{item.content}</Text>
      ) : (
        <Markdown rules={markdownRules} style={markdownStyles}>
          {formatMessageText(item.content)}
        </Markdown>
      )}
    </Pressable>
  );
}, (prevProps, nextProps) => prevProps.item.content === nextProps.item.content && prevProps.item.type === nextProps.item.type && prevProps.themeColors === nextProps.themeColors);


const ConnectionBeacon = ({ accentColor, isBackendConnected }: { accentColor: string, isBackendConnected: boolean }) => {
  const opacityAnim = useRef(new Animated.Value(isBackendConnected ? 0.2 : 1)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isBackendConnected) {
      opacityAnim.setValue(0.2);
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(opacityAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.2, duration: 1000, useNativeDriver: true })
        ])
      );
      loopRef.current.start();
    } else {
      if (loopRef.current) loopRef.current.stop();
      opacityAnim.setValue(1);
    }
    
    return () => {
      if (loopRef.current) loopRef.current.stop();
    };
  }, [isBackendConnected, opacityAnim]);

  return (
    <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isBackendConnected ? accentColor : '#EF4444', opacity: opacityAnim, marginLeft: 8 }} />
  );
};

const EmptyStateCards = ({ role, themeColors, setInputText }: { role: string, themeColors: any, setInputText: (text: string) => void }) => {
  const features = ROLE_FEATURES[role] || ROLE_FEATURES['Standard'];
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, marginTop: 100 }}>
      <Bot color={themeColors.Accent} size={48} style={{ marginBottom: 20, opacity: 0.8 }} />
      <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 20 }}>How can I help you today?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
        {features.slice(0, 3).map((f, i) => (
          <TouchableOpacity 
            key={i} 
            onPress={() => setInputText(`Can you help me with: ${f.title}?`)}
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: 15, borderRadius: 12, margin: 8, width: '40%', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' }}
          >
            <Text style={{ color: themeColors.Accent, fontWeight: 'bold', marginBottom: 4 }}>{f.title}</Text>
            <Text style={{ color: '#888', fontSize: 12 }}>{f.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const ChatScreen = () => {
  const { height } = Dimensions.get('window');
  const router = useRouter();
  const [backendURL, setBackendURL] = useState<string | null>(null);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [isLoadingPairing, setIsLoadingPairing] = useState(true);

  const [coreMemories, setCoreMemories] = useState<string[]>([]);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [selectedMessageText, setSelectedMessageText] = useState("");
  const [calmAlertVisible, setCalmAlertVisible] = useState(false);
  const [isStudyMode, setIsStudyMode] = useState(false);

  interface AccountItem { name: string; role: string; }
  const [availableAccounts, setAvailableAccounts] = useState<AccountItem[]>([]);
  const [authAction, setAuthAction] = useState<'login' | 'delete'>('login'); // NEW: Tracks what the PIN is being used for
  const [isSwitchAuthVisible, setIsSwitchAuthVisible] = useState(false);
  const [selectedAccountName, setSelectedAccountName] = useState('');
  const [switchPin, setSwitchPin] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!backendURL) return;
    const fetchMemories = async () => {
      try {
        const response = await fetch(`${backendURL}/memory`);
        if (response.ok) {
          const data = await response.json();
          const fetchedMemories = data.memories || data.memory_list || [];
          
          // Only update if the backend actually sent data, preventing the overwrite bug
          if (fetchedMemories.length > 0) {
            setCoreMemories(fetchedMemories);
          }
        }
      } catch (error) {}
    };
    fetchMemories();
    const intervalId = setInterval(fetchMemories, 5000);
    return () => clearInterval(intervalId);
  }, [backendURL]);

  useEffect(() => {
    if (!backendURL) return;

    const checkHealth = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const response = await fetch(`${backendURL}`, { 
          method: 'GET',
          signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        setIsBackendConnected(response.ok);
      } catch (error) {
        setIsBackendConnected(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    
    return () => clearInterval(interval);
  }, [backendURL]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasReceivedFirstChunk, setHasReceivedFirstChunk] = useState(false);
  
  const [currentTheme, setCurrentTheme] = useState<Theme>('One Dark');
  const accentColor = getThemeAccent(currentTheme);
  const [currentPersona, setCurrentPersona] = useState<Persona>('Standard');
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);
  const [coreMemory, setCoreMemory] = useState<string[]>([]);
  const [userMemory, setUserMemory] = useState<string[]>([]);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('Student');
  const [isAgenticMode, setIsAgenticMode] = useState(false);
  const [authSuccessMessage, setAuthSuccessMessage] = useState('');

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebarWidth = Dimensions.get('window').width * 0.8;
  const sidebarAnim = useRef(new Animated.Value(-sidebarWidth)).current;

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
  const snapBottomOpacity = useRef(new Animated.Value(0)).current;

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 50;
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    isScrolledUp.current = !isAtBottom;
    Animated.timing(snapBottomOpacity, {
      toValue: isAtBottom ? 0 : 1,
      duration: 150,
      useNativeDriver: true
    }).start();
  };

  useEffect(() => {
    const enforceSecurityBarrier = async () => {
      try {
        const token = await SecureStore.getItemAsync('session_token');
        
        if (!token) {
          console.warn("[SECURITY EJECTION]: Unauthorized access attempt detected. No session token found.");
          router.replace('/signup');
          return;
        }

        const savedUrl = await SecureStore.getItemAsync('backend_url');
        if (savedUrl) {
          setBackendURL(savedUrl);
        }
        setIsLoadingPairing(false);
        
        const restoredUserName = await SecureStore.getItemAsync('saved_name');
        if (restoredUserName) {
          setUserName(restoredUserName);
          await loadUserSessions(restoredUserName);
          await fetchUserMemory(restoredUserName);
        } else {
          await loadUserSessions();
        }
      } catch (error) {
        console.error("Security check failed", error);
        router.replace('/signup');
      }
    };
    enforceSecurityBarrier();
  }, []);

  useEffect(() => {
    if (isSettingsModalVisible && userName) {
      fetchUserMemory(userName);
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
  
  // AUTO-SAVE HOOK: Fires every single time the 'messages' array changes
  useEffect(() => {
    // Only save if there are actual messages to save, preventing empty overwrites
    if (messages.length > 0 && currentSessionId && userName) {
      saveActiveSession(messages);
    }
  }, [messages, currentSessionId, userName]);

  const loadUserSessions = async (targetUserName?: string) => {
    try {
      const nameToLoad = targetUserName || userName || await SecureStore.getItemAsync('saved_name');
      if (!nameToLoad) return;
      const stored = await AsyncStorage.getItem(`@sessions_${nameToLoad}`);
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
        setSessions([]);
        createNewSession();
      }
    } catch (e) {
      setSessions([]);
      createNewSession();
    }
  };

  // Safely updates the active session and writes directly to the user's isolated storage
  const saveActiveSession = async (updatedMessages: Message[]) => {
    if (!userName || !currentSessionId || updatedMessages.length === 0) return;

    setSessions(prevSessions => {
      const existingIndex = prevSessions.findIndex(s => s.id === currentSessionId);
      let newSessions = [...prevSessions];

      if (existingIndex >= 0) {
        // Update the existing chat session with the new messages
        newSessions[existingIndex] = {
          ...newSessions[existingIndex],
          messages: updatedMessages,
        };
      } else {
        // If this is a brand new chat, create the session object
        newSessions = [{
          id: currentSessionId,
          title: updatedMessages[0]?.content?.substring(0, 30) + '...' || 'New Chat',
          messages: updatedMessages
        }, ...prevSessions];
      }

      // IMMEDIATELY persist to the hardware using the active user's exact key
      AsyncStorage.setItem(`@sessions_${userName}`, JSON.stringify(newSessions))
        .catch(err => console.error("Failed to save session to disk:", err));

      return newSessions;
    });
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
    if (userName) await AsyncStorage.setItem(`@sessions_${userName}`, JSON.stringify(newSessions));
    if (currentSessionId === id) {
      if (newSessions.length > 0) {
        switchSession(newSessions[0].id);
      } else {
        createNewSession();
      }
    }
  };

  const toggleSidebar = (forceClose = false) => {
    const toValue = (isSidebarOpen || forceClose) ? -sidebarWidth : 0;
    Animated.timing(sidebarAnim, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setIsSidebarOpen(!(isSidebarOpen || forceClose));
  };

  const fetchUserMemory = async (currentUserName: string) => {
    // 1. Abort gracefully if no user is selected or backendURL is undefined
    if (!currentUserName || !backendURL) {
      console.log("[Memory] Skipping fetch: User or Backend URL not ready.");
      return;
    }
    
    try {
      const response = await fetch(`${backendURL}/auth/user/memory?name=${currentUserName}`);
      const data = await response.json();
      
      if (data.status === 'success') {
        if (typeof setCoreMemory === 'function') setCoreMemory(data.core_memory);
        if (typeof setUserMemory === 'function') setUserMemory(data.user_memory);
      }
    } catch (error) {
      // 2. Silently catch network errors so the app DOES NOT crash
      console.log("[Memory] Network unreachable, but app will continue safely.", error);
    }
  };




  const sendMessage = async (overrideText?: string | any, overrideHistory?: Message[], skipAgent: boolean = false) => {
    const text = overrideText || inputText.trim();
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

    // AGENTIC OVERRIDE FLOW (SMART ROUTING)
    if (isAgenticMode && !isCommand) {
      // Expanded intercept: Catches "code", "script", languages, and structural terms
      const isLaptopTypingRequest = /\b(code|script|program|java|python|javascript|cpp|c\+\+|html|css|function|class|loop)\b/i.test(finalMessage);
      
      // Ignore special agent commands so they pass through to the chat stream
      const isSpecialCommand = finalMessage.startsWith('/');

      // Only hijack for laptop typing if it's a code request AND not a slash command
      if (isLaptopTypingRequest && !isSpecialCommand) {
        const userMessage: Message = { id: Date.now().toString() + '-user', role: 'user', content: finalMessage };
        const proceedMessage: Message = { 
          id: Date.now().toString() + '-agent', 
          role: 'ai', 
          content: '', 
          type: 'agent_proceed', 
          originalPrompt: finalMessage 
        };
        
        setMessages(overrideHistory ? [...overrideHistory, proceedMessage] : [...messages, userMessage, proceedMessage]);
        if (!overrideHistory) setInputText('');
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        return; // Stop here! Wait for the user to click "Proceed".
      }
    }

    const aiMessageId = (Date.now() + 1).toString() + '-ai';
    const initialAiMessage: Message = { id: aiMessageId, role: 'ai', content: '', type: isCommand ? 'terminal' : 'text' };
    
    let newMessagesForState;
    let baseHistoryForApi;

    if (overrideHistory) {
      newMessagesForState = [...overrideHistory, initialAiMessage];
      baseHistoryForApi = overrideHistory;
    } else {
      const userMessage: Message = { id: Date.now().toString() + '-user', role: 'user', content: finalMessage };
      newMessagesForState = [...messages, userMessage, initialAiMessage];
      baseHistoryForApi = [...messages, userMessage];
    }
    
    setMessages(newMessagesForState);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    if (!overrideText) setInputText('');
    setIsLoading(true);
    setHasReceivedFirstChunk(false);

    try {
      const host = await SecureStore.getItemAsync('host');
      const session_token = await SecureStore.getItemAsync('session_token');

      if (!host || !session_token) {
        throw new Error("Missing connection credentials. Please reconnect.");
      }

      abortControllerRef.current = new AbortController();

      // Convert messages to Ollama format
      const apiMessages = baseHistoryForApi.map(m => {
        return {
          role: m.role === 'ai' ? 'assistant' : m.role,
          content: m.content
        };
      });
      
      apiMessages.push({ role: 'user', content: finalMessage });

      const es = new EventSource<"memory">(`${backendURL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        ...(abortControllerRef.current ? { signal: abortControllerRef.current.signal } : {}),
        body: JSON.stringify({
          messages: apiMessages,
          persona: finalPersona,
          is_command: isCommand,
          role: userRole,
          is_study_mode: isStudyMode,
          is_agentic_mode: isAgenticMode,
          name: userName // NEW: Crucial for the backend to fetch this user's memory
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
            if (data.type === 'agent_intercept') {
              setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], type: 'agent_intercept', originalPrompt: data.prompt };
                return newMsgs;
              });
              es.close();
              setIsLoading(false);
              setHasReceivedFirstChunk(true);
              return;
            }
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

              let chunkText = data.chunk;

              // Intercept Core Memory tags
              const memoryMatch = chunkText.match(/\[CORE_MEMORY:\s*(.+?)\]/);
              if (memoryMatch) {
                const extractedFact = memoryMatch[1];
                setCoreMemories((prev) => !prev.includes(extractedFact) ? [...prev, extractedFact] : prev);
                chunkText = chunkText.replace(/\[CORE_MEMORY:\s*(.+?)\]/, '');
              }

              // Intercept CALM Mode tags
              if (chunkText.includes('[CALM_MODE_ACTIVE]')) {
                setCalmAlertVisible(true);
                setTimeout(() => setCalmAlertVisible(false), 5000);
                chunkText = chunkText.replace('[CALM_MODE_ACTIVE]', '');
              }

              // Prevent empty chunk rendering
              if (chunkText.trim() === '' && !data.chunk.includes('\n')) return;

              setMessages(prevMessages => {
                const newMessages = [...prevMessages];
                const lastIndex = newMessages.length - 1;
                newMessages[lastIndex] = {
                  ...newMessages[lastIndex],
                  content: newMessages[lastIndex].content + chunkText
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



  const handleAgentAction = async (messageId: string, action: 'skip' | 'proceed_prompt' | 'execute') => {
    const msgIndex = messages.findIndex(m => m.id === messageId);
    const msg = messages[msgIndex];
    if (!msg || !msg.originalPrompt) return;

    if (action === 'skip') {
      // Re-run normally, skipping the interceptor
      const history = messages.slice(0, msgIndex - 1);
      sendMessage(msg.originalPrompt, history, true);
    } else if (action === 'proceed_prompt') {
      // Advance UI to the warning state
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, type: 'agent_proceed' } : m));
    } else if (action === 'execute') {
      // Fire execution endpoint
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, type: 'agent_done', content: 'Typing code into your laptop in real-time...' } : m));
      try {
        const token = await SecureStore.getItemAsync('session_token');
        await fetch(`${backendURL}/agent/type`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'session-token': token || '' },
          body: JSON.stringify({ 
            prompt: msg.originalPrompt,
            name: userName // NEW: Sends the active profile name to fetch memory
          })
        });
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: 'Code successfully typed into laptop.' } : m));
      } catch (e) {}
    }
  };

  const renderItem = useCallback(({ item }: { item: Message }) => {
    return (
      <MessageBubble 
        item={item} 
        themeColors={themeColors} 
        styles={styles} 
        backendURL={backendURL!} 
        onLongPressBubble={(content) => {
          setSelectedMessageText(content);
          setActionMenuVisible(true);
        }}
        handleAgentAction={handleAgentAction}
      />
    );
  }, [themeColors, backendURL, messages]);

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

  const categorizedSessions = [
    { title: "Recent", data: sessions.slice(0, 3) },
    { title: "Older", data: sessions.slice(3) }
  ].filter(s => s.data.length > 0);

  const renderSessionAction = (id: string) => (
    <TouchableOpacity onPress={() => deleteSession(id)} style={{ backgroundColor: '#ff453a', justifyContent: 'center', alignItems: 'center', width: 60, height: '100%', borderRadius: 8 }}>
      <Trash2 color="#FFF" size={20} />
    </TouchableOpacity>
  );

  const openSwitchAccount = async () => {
    try {
      const response = await fetch(`${backendURL}/auth/users`);
      const data = await response.json();
      if (data.status === 'success') {
        setAvailableAccounts(data.users);
        setIsSwitchAuthVisible(true);
        setSwitchPin('');
        setAuthError('');
        setAuthAction('login'); // Default to login
      }
    } catch (error) {
      console.error("Failed to fetch users", error);
    }
  };

  const executeSecureAuthAction = async (isBiometric: boolean = false) => {
    if (!selectedAccountName) {
      setAuthError('Please select an account.');
      return;
    }
    if (!isBiometric && switchPin.length !== 6) {
      setAuthError('Please enter the 6-digit PIN.');
      return;
    }

    try {
      const endpoint = authAction === 'delete' ? '/auth/user' : '/auth/login';
      const method = authAction === 'delete' ? 'DELETE' : 'POST';
      
      const response = await fetch(`${backendURL}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: selectedAccountName, 
          pin: isBiometric ? null : switchPin,
          biometric_auth: isBiometric 
        })
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        if (authAction === 'delete') {
          // --- NEW: PERMANENTLY DESTROY LOCAL DATA ---
          // Wipe the specific user's chat history from the phone's hard drive so it can never be recovered
          await AsyncStorage.removeItem(`@sessions_${selectedAccountName}`);
          // ------------------------------------------

          setAuthSuccessMessage(`Farewell, ${selectedAccountName}. Account deleted.`);
          setTimeout(async () => {
            setAuthSuccessMessage('');
            if (availableAccounts.length <= 1) {
              // Zero accounts left: Wipe token and redirect to Auth/Signup Screen
              await SecureStore.deleteItemAsync('session_token');
              setIsSwitchAuthVisible(false);
              router.replace('/');
            } else {
              openSwitchAccount(); // Refresh list if accounts still remain
            }
          }, 2000);
        } else {
          // --- NEW LOGIN SUCCESS LOGIC ---
          
          // 1. Securely store the new token
          await SecureStore.setItemAsync('session_token', data.session_token);
          
          // 2. Update the active React states to instantly transform the UI!
          setUserName(data.name);
          setUserRole(data.role);
          
          // 3. WIPE the active chat canvas so they don't see the previous user's active screen
          setMessages([]);
          setCurrentSessionId('');
          setInputText('');
          
          // 4. RESTORE the incoming user's specific session history!
          await loadUserSessions(data.name);
          await fetchUserMemory(data.name);
          
          // 5. Trigger the beautifully styled success view (matching the delete style)
          setAuthSuccessMessage(`Welcome back, ${data.name}!`);
          
          // 6. Wait for the user to see the success message, then close the modal
          setTimeout(() => {
            setAuthSuccessMessage('');
            setIsSwitchAuthVisible(false);
            setIsSettingsModalVisible(false);
          }, 1500);
        }
      } else {
        setAuthError(data.detail || 'Authentication failed.');
      }
    } catch (error) {
      setAuthError('Network error connecting to backend.');
    }
  };

  const handleBiometricAuth = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    
    if (!hasHardware || !isEnrolled) {
      setAuthError('Biometrics not setup on this device.');
      return;
    }
    
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: authAction === 'delete' ? 'Authenticate to Delete Profile' : 'Authenticate to Unlock Profile',
      fallbackLabel: 'Use PIN'
    });
    
    if (result.success) {
      executeSecureAuthAction(true);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0D1117' }}>
      
      {/* Sidebar Background Overlay */}
      {isSidebarOpen && (
        <Pressable 
          style={[StyleSheet.absoluteFill, { zIndex: 99, backgroundColor: 'rgba(0,0,0,0.5)' }]} 
          onPress={() => toggleSidebar(true)} 
        />
      )}

      {/* Sidebar Container */}
      <Animated.View 
        style={[styles.sidebar, { transform: [{ translateX: sidebarAnim }], backgroundColor: themeColors.Surface, width: sidebarWidth }]}
        pointerEvents={isSidebarOpen ? 'auto' : 'none'}
      >
        <View style={styles.sidebarHeader}>
          <Text style={[styles.sidebarTitle, { color: themeColors.Accent }]}>Sessions</Text>
          <TouchableOpacity onPress={createNewSession}>
            <Text style={{ color: themeColors.Accent, fontWeight: 'bold' }}>+ New</Text>
          </TouchableOpacity>
        </View>
        <SectionList
          style={{ flex: 1 }}
          sections={categorizedSessions}
          keyExtractor={item => item.id}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={{ color: '#888', fontSize: 12, fontWeight: 'bold', paddingHorizontal: 15, paddingTop: 15, paddingBottom: 5, textTransform: 'uppercase' }}>{title}</Text>
          )}
          renderItem={({ item }) => (
            <Swipeable renderRightActions={() => renderSessionAction(item.id)}>
              <TouchableOpacity style={[styles.sessionItem, currentSessionId === item.id && { backgroundColor: themeColors.Accent + '20' }]} onPress={() => switchSession(item.id)}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: '#FFF', flex: 1 }} numberOfLines={1}>{item.title}</Text>
                  <View style={{ backgroundColor: themeColors.Accent + '30', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 }}>
                    <Text style={{ color: themeColors.Accent, fontSize: 10, fontWeight: 'bold' }}>{detectLanguage(item.title)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </Swipeable>
          )}
        />

        {/* Sidebar Footer */}
        <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center' }} 
            onPress={() => setIsSettingsModalVisible(true)}
          >
            <Settings color={themeColors.Accent} size={24} />
            <Text style={{ color: '#FFF', fontSize: 16, marginLeft: 12 }}>Preferences</Text>
          </TouchableOpacity>

          {/* NEW: The Avatar Switcher */}
          <TouchableOpacity 
            style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 20 }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openSwitchAccount();
            }}
          >
            <User color={themeColors.Accent} size={20} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Main Content */}
      <View style={{ paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }}>
        {/* Header Top Bar */}
        <View style={[styles.topBar, { backgroundColor: themeColors.Surface, justifyContent: 'center', alignItems: 'center' }]}>
          
          {/* Left: Sidebar Toggle */}
          <TouchableOpacity onPress={() => toggleSidebar()} style={{ position: 'absolute', left: 15, zIndex: 1 }}>
            <Menu color={themeColors.Accent} size={24} />
          </TouchableOpacity>
          
          {/* Center: Title & Beacon */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.headerTitle, { color: accentColor, fontWeight: '600', letterSpacing: 0.5 }]}>
              CodeAmigo
            </Text>
            <ConnectionBeacon accentColor={accentColor} isBackendConnected={isBackendConnected} />
          </View>

          {/* Right: Toggles Container */}
          <View style={{ position: 'absolute', right: 15, zIndex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            
            {/* Study Toggle (STRICTLY ONLY FOR STUDENT ROLE) */}
            {userRole === 'Student' && (
              <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsStudyMode(!isStudyMode); }}>
                <Text style={{
                  color: isStudyMode ? accentColor : '#666', fontWeight: 'bold', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1,
                  textShadowColor: isStudyMode ? accentColor : 'transparent', textShadowRadius: isStudyMode ? 10 : 0
                }}>
                  Study
                </Text>
              </Pressable>
            )}

            {/* Agentic Toggle (AVAILABLE TO ALL ROLES) */}
            <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsAgenticMode(!isAgenticMode); }}>
              <Text style={{
                color: isAgenticMode ? accentColor : '#666', fontWeight: 'bold', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1,
                textShadowColor: isAgenticMode ? accentColor : 'transparent', textShadowRadius: isAgenticMode ? 10 : 0
              }}>
                Agent
              </Text>
            </Pressable>

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
          
          /* NEW: Performance Optimization Props */
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={true}

          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          ListEmptyComponent={!isLoading ? <EmptyStateCards role={userRole} themeColors={themeColors} setInputText={setInputText} /> : null}
          ListFooterComponent={isLoading && !hasReceivedFirstChunk ? <TypingIndicator themeColors={themeColors} /> : null}
          onContentSizeChange={() => {
            if (!isScrolledUp.current) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
        />

        <Animated.View style={{ position: 'absolute', bottom: 100, right: 20, opacity: snapBottomOpacity, zIndex: 10 }} pointerEvents="box-none">
          <TouchableOpacity 
            onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
            style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 10, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
          >
            <ArrowDownCircle color={themeColors.Accent} size={24} />
          </TouchableOpacity>
        </Animated.View>

        <View style={{ flexShrink: 0 }}>
          <View style={[styles.inputArea, { backgroundColor: themeColors.Surface, flexDirection: 'column', alignItems: 'stretch' }]}>

              <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                <TextInput
                  style={[styles.textInput, { backgroundColor: themeColors.Background, maxHeight: 120 }]}
                  placeholder="Ask CodeAmigo..."
                  placeholderTextColor="#888"
                  value={inputText}
                  onChangeText={setInputText}
                  multiline={true}
                />
                <View style={styles.buttonsContainer}>
                  <TouchableOpacity style={[styles.iconButton, { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: 8 }]} onPress={handlePasteFromLaptop} disabled={isLoading}>
                    <ClipboardIcon color={themeColors.Accent} size={20} />
                  </TouchableOpacity>
                  {isLoading ? (
                    <TouchableOpacity style={[styles.sendButton, { backgroundColor: '#FF453A' }]} onPress={stopGeneration}>
                      <Text style={styles.sendButtonText}>Stop</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.sendButton, { backgroundColor: themeColors.Accent }]} onPress={() => sendMessage()}>
                      <Text style={styles.sendButtonText}>Send</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <Text style={{ fontSize: 10, color: '#666', marginTop: 4, marginLeft: 2 }}>Mem: ~2.4kb / Local Context Active</Text>
            </View>
        </View>
      </KeyboardAvoidingView>

      {/* Settings Modal */}
      <Modal visible={isSettingsModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          
          {/* 1. SIBLING A: The Background Overlay (Absolute Fill) */}
          {/* Because this is absolute and a sibling, it catches background taps without wrapping the content */}
          <Pressable 
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]} 
            onPress={() => setIsSettingsModalVisible(false)} 
          />
          
          {/* 2. SIBLING B: The Modal Content Box */}
          {/* This is just a View. No touch wrappers, no gesture stealers. */}
          <View style={{ 
            backgroundColor: '#1E1E20', 
            borderRadius: 24, 
            width: '90%', 
            height: Dimensions.get('window').height * 0.75, 
            overflow: 'hidden', 
            paddingTop: 20,
            zIndex: 1 // Ensures it sits above the absolute background
          }}>
            
            <Text style={{ color: accentColor, fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 }}>
              Settings
            </Text>

                {/* The Scrollable Inner Content */}
                <ScrollView 
                  style={{ flex: 1 }} // Now safely fills the exact height provided by the parent
                  contentContainerStyle={{ 
                    paddingHorizontal: 20, 
                    paddingBottom: 24 
                  }}
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                  keyboardShouldPersistTaps="handled"
                  scrollEventThrottle={16}
                >
                  
                  {/* Role Profile Panel */}
                  <View style={styles.settingsPanel}>
                    <Text style={styles.modalLabel}>Role Profile</Text>
                    <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>{userRole}</Text>
                    {(ROLE_FEATURES[userRole] || ROLE_FEATURES['Standard'])?.map((feature, index) => (
                      <View key={index} style={{ marginBottom: 8 }}>
                        <Text style={{ color: accentColor, fontWeight: 'bold' }}>{feature.title}:</Text>
                        <Text style={{ color: '#E2E8F0', fontSize: 14 }}>{feature.desc}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Persona Panel */}
                  <View style={styles.settingsPanel}>
                    <Text style={styles.modalLabel}>Persona</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {(['Standard', 'Rubber Duck', 'Sassy Senior Dev', 'Socratic TA', 'Complexity Analyzer'] as Persona[]).map(p => (
                        <TouchableOpacity key={p} style={[styles.modalOption, currentPersona === p && { backgroundColor: themeColors.Accent + '40' }, { marginRight: 10 }]} onPress={() => { setCurrentPersona(p); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                          <Text style={{ color: currentPersona === p ? themeColors.Accent : '#FFF' }}>{p}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Theme Panel */}
                  <View style={styles.settingsPanel}>
                    <Text style={styles.modalLabel}>Theme</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {(['Dracula', 'One Dark', 'Monokai'] as Theme[]).map(t => (
                        <TouchableOpacity 
                          key={t} 
                          style={[styles.modalOption, currentTheme === t && { backgroundColor: THEMES[t].Accent + '40' }, { marginRight: 10, marginBottom: 10 }]} 
                          onPress={() => { setCurrentTheme(t); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                        >
                          <Text style={{ color: currentTheme === t ? THEMES[t].Accent : '#FFF' }}>{t}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Core Memory Panel */}
                  <View style={styles.settingsPanel}>
                    <Text style={styles.modalLabel}>Local Backend Memory</Text>
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                      {coreMemories.length === 0 ? (
                        <Text style={{ color: '#666', fontStyle: 'italic', fontSize: 13 }}>No core memories active.</Text>
                      ) : (
                        coreMemories.map((memory, index) => (
                          <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: accentColor, marginRight: 8 }} />
                            <Text style={{ color: '#E0E0E0', fontSize: 13 }}>{memory}</Text>
                          </View>
                        ))
                      )}
                    </View>
                  </View>

                </ScrollView>

          </View>
        </View>
      </Modal>

      {/* Secure Switch Account Modal */}
      <Modal visible={isSwitchAuthVisible} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.8)' }]} onPress={() => setIsSwitchAuthVisible(false)} />
          
          <View style={{ backgroundColor: '#1E1E20', borderRadius: 24, width: '85%', padding: 24, zIndex: 1 }}>
            
            {/* STYLED SUCCESS VIEW */}
            {authSuccessMessage ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <CheckCircle color={accentColor} size={64} style={{ marginBottom: 16 }} />
                <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold', textAlign: 'center' }}>{authSuccessMessage}</Text>
              </View>
            ) : (
              <>
                <Text style={{ color: accentColor, fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 }}>
                  Select Profile
                </Text>
                
                <ScrollView style={{ maxHeight: 160, marginBottom: 16 }}>
                  {availableAccounts.map(account => (
                    <View key={account.name} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      
                      <TouchableOpacity 
                        style={{ flex: 1, padding: 12, backgroundColor: selectedAccountName === account.name && authAction === 'login' ? 'rgba(255,255,255,0.1)' : 'transparent', borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between' }}
                        onPress={() => { setSelectedAccountName(account.name); setAuthAction('login'); setAuthError(''); }}
                      >
                        <Text style={{ color: selectedAccountName === account.name && authAction === 'login' ? accentColor : '#FFF', fontWeight: 'bold' }}>
                          {account.name}
                        </Text>
                        <Text style={{ color: '#A1A1AA', fontSize: 12, alignSelf: 'center' }}>{account.role}</Text>
                      </TouchableOpacity>

                      {/* NEW PROFESSIONAL TRASH ICON */}
                      <TouchableOpacity 
                        style={{ padding: 12, marginLeft: 8, backgroundColor: selectedAccountName === account.name && authAction === 'delete' ? 'rgba(239, 68, 68, 0.2)' : 'transparent', borderRadius: 8 }}
                        onPress={() => { setSelectedAccountName(account.name); setAuthAction('delete'); setAuthError(''); }}
                      >
                        <Trash2 color={selectedAccountName === account.name && authAction === 'delete' ? '#EF4444' : '#666'} size={20} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>

                <Text style={{ color: authAction === 'delete' ? '#EF4444' : '#A1A1AA', fontSize: 14, marginBottom: 8, textAlign: 'center' }}>
                  {authAction === 'delete' ? 'Enter PIN to permanently DELETE:' : 'Enter 6-Digit PIN to unlock:'}
                </Text>
                
                <TextInput
                  style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: authAction === 'delete' ? '#EF4444' : '#FFF', padding: 16, borderRadius: 12, fontSize: 20, textAlign: 'center', letterSpacing: 8, marginBottom: 16 }}
                  keyboardType="numeric"
                  maxLength={6}
                  secureTextEntry
                  value={switchPin}
                  onChangeText={setSwitchPin}
                />

                {authError ? <Text style={{ color: '#EF4444', textAlign: 'center', marginBottom: 16 }}>{authError}</Text> : null}

                {/* BUTTON ROW: PIN SUBMIT & BIOMETRICS */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity 
                    style={{ flex: 1, backgroundColor: authAction === 'delete' ? '#EF4444' : accentColor, padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => executeSecureAuthAction(false)}
                  >
                    <Text style={{ color: authAction === 'delete' ? '#FFF' : '#000', fontWeight: 'bold', fontSize: 16 }}>
                      {authAction === 'delete' ? 'Delete Profile' : 'Unlock'}
                    </Text>
                  </TouchableOpacity>

                  {/* BIOMETRIC BUTTON */}
                  <TouchableOpacity 
                    style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                    onPress={handleBiometricAuth}
                  >
                    <Fingerprint color={accentColor} size={24} />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal transparent visible={actionMenuVisible} animationType="slide">
        <Pressable 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          onPress={() => setActionMenuVisible(false)}
        >
          <View style={{ 
            backgroundColor: '#1E1E20', borderRadius: 24, marginHorizontal: 16, marginBottom: 32, padding: 24,
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', elevation: 10
          }}>
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 20 }}>Message Actions</Text>
            
            {/* Copy Action */}
            <Pressable 
              style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}
              onPress={() => {
                ExpoClipboard.setStringAsync(selectedMessageText);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setActionMenuVisible(false);
              }}
            >
              <Text style={{ color: accentColor, fontSize: 16, fontWeight: '600' }}>Copy Text</Text>
            </Pressable>

            {/* Regenerate Action */}
            <Pressable 
              style={{ paddingVertical: 16 }}
              onPress={() => {
                setActionMenuVisible(false);
                const targetIndex = messages.findIndex(msg => msg.content === selectedMessageText);
                if (targetIndex === -1) return;
                
                const updatedHistory = messages.slice(0, targetIndex);
                setMessages(updatedHistory);
                
                const lastUserMessage = [...updatedHistory].reverse().find(m => m.role === 'user');
                if (lastUserMessage) {
                  sendMessage(lastUserMessage.content, updatedHistory);
                }
              }}
            >
              <Text style={{ color: '#E0E0E0', fontSize: 16 }}>Regenerate Response</Text>
            </Pressable>
          </View>
        </Pressable>
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
    borderRadius: 12,
    marginBottom: 10,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  settingsPanel: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
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
    borderRadius: 24,
    padding: 24,
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
    zIndex: 100,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    borderRightWidth: 1,
    borderColor: '#333',
    display: 'flex',
    flexDirection: 'column',
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
