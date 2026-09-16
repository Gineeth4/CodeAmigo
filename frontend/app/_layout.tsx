import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" options={{ animation: 'none' }} />
        <Stack.Screen name="signup" options={{ animation: 'fade' }} />
        <Stack.Screen name="scanner" options={{ animation: 'fade' }} />
        <Stack.Screen name="chat" />
      </Stack>
    </GestureHandlerRootView>
  );
}
