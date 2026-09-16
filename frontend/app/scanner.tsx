import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  withSpring, 
  runOnJS, 
  Easing 
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

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
  ]
};

const Corner = ({ style }: { style: any }) => (
  <View style={[{ position: 'absolute', borderColor: '#4DA8DA', width: 20, height: 20 }, style]} />
);

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const router = useRouter();

  const [showFeatures, setShowFeatures] = useState(false);
  const [userRole, setUserRole] = useState("Student");

  // Laser animation
  const laserY = useSharedValue(0);
  useEffect(() => {
    laserY.value = withRepeat(
      withTiming(250, { duration: 1500, easing: Easing.linear }),
      -1,
      true
    );
  }, []);

  const laserStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: laserY.value }],
  }));

  // Pulse animation
  const pulseOpacity = useSharedValue(0.5);
  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  // Swipe Gesture
  const translateX = useSharedValue(0);
  const pan = Gesture.Pan()
    .onChange((event) => {
      if (event.translationX < 0) translateX.value = event.translationX; // Only allow left swipe
    })
    .onEnd((event) => {
      if (event.translationX < -150 || event.velocityX < -500) {
        runOnJS(router.replace)('/chat');
      } else {
        translateX.value = withSpring(0);
      }
    });

  const animatedOverlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }]
  }));

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      async function resetSession() {
        await SecureStore.deleteItemAsync('backend_url');
        console.log('🗑️ Cached backend URL wiped. Forcing new scan.');
      }
      resetSession();
      return () => {
        setScanned(false);
        setShowFeatures(false);
      };
    }, [])
  );

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (scanned) return;
    
    setScanned(true); // Lock scanner
  
    try {
      // 1. Parse the JSON payload
      const parsedData = JSON.parse(data);
      const backendHost = parsedData.host;
      const sessionToken = parsedData.session_token;
  
      // 2. Validate the host exists
      if (!backendHost || !backendHost.startsWith('http')) {
        throw new Error("Invalid host URL format in QR code.");
      }
  
      // 3. Securely save the credentials silently
      await SecureStore.setItemAsync('backend_url', backendHost);
      await SecureStore.setItemAsync('host', backendHost); // Also required by chat.tsx
      
      if (sessionToken) {
        await SecureStore.setItemAsync('session_token', sessionToken);
      }
  
      // 4. Fetch the role and show the UI
      const role = await SecureStore.getItemAsync('user_role');
      if (role && ROLE_FEATURES[role]) setUserRole(role);
      setShowFeatures(true);
      
    } catch (error) {
      Alert.alert("Invalid QR", "Please scan a valid CodeAmigo backend QR code.");
      setScanned(false); // Unlock scanner so the user can try again
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <CameraView 
        style={styles.camera} 
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
      />
      
      {!showFeatures && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.targetSquare}>
            <Corner style={{ top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8, shadowColor: '#4DA8DA', shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }} />
            <Corner style={{ top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8, shadowColor: '#4DA8DA', shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }} />
            <Corner style={{ bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8, shadowColor: '#4DA8DA', shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }} />
            <Corner style={{ bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8, shadowColor: '#4DA8DA', shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }} />
            
            <Animated.View style={[styles.laser, laserStyle]} />
          </View>
          <Text style={styles.instruction}>Scan the QR code on your laptop terminal to pair.</Text>
        </View>
      )}

      {showFeatures && (
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.featuresOverlay, animatedOverlayStyle]}>
            <Text style={styles.welcomeText}>System Initialized.</Text>
            <Text style={styles.roleTitle}>{userRole} Mode</Text>
            
            <View style={styles.cardsContainer}>
              {ROLE_FEATURES[userRole].map((feat, idx) => (
                <View key={idx} style={styles.featureCard}>
                  <Text style={styles.featureCardTitle}>{feat.title}</Text>
                  <Text style={styles.featureCardDesc}>{feat.desc}</Text>
                </View>
              ))}
            </View>

            <Animated.Text style={[styles.swipeText, pulseStyle]}>
              ← Swipe left to initialize chat
            </Animated.Text>
          </Animated.View>
        </GestureDetector>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    textAlign: 'center',
    paddingBottom: 20,
    color: '#FFF',
    fontSize: 16,
    paddingHorizontal: 20,
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetSquare: {
    width: 250,
    height: 250,
    backgroundColor: 'transparent',
    marginBottom: 40,
    overflow: 'hidden',
  },
  laser: {
    width: '100%',
    height: 2,
    backgroundColor: '#4DA8DA',
    shadowColor: '#4DA8DA',
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  instruction: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: '#0A84FF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  featuresOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(9, 9, 11, 0.9)',
    paddingTop: 80,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  welcomeText: {
    color: '#4DA8DA',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  roleTitle: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 40,
    textAlign: 'center',
  },
  cardsContainer: {
    width: '100%',
    gap: 15,
  },
  featureCard: {
    backgroundColor: 'rgba(77, 168, 218, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(77, 168, 218, 0.3)',
    borderRadius: 12,
    padding: 16,
    width: '100%',
  },
  featureCardTitle: {
    color: '#4DA8DA',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  featureCardDesc: {
    color: '#A1A1AA',
    fontSize: 14,
    lineHeight: 20,
  },
  swipeText: {
    color: '#4DA8DA',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 'auto',
    marginBottom: 60,
    letterSpacing: 1,
  }
});
