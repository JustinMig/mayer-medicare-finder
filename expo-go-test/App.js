import React, { useRef, useState } from 'react';
import { SafeAreaView, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

const FINDER_URL = 'https://medicare.mayerig.com/?appShell=1';
const MEDICARE_URL = 'https://www.medicare.gov/account/login';

export default function App() {
  const [active, setActive] = useState('medicare');
  const [finderLoading, setFinderLoading] = useState(true);
  const [medicareLoading, setMedicareLoading] = useState(true);
  const finderRef = useRef(null);
  const medicareRef = useRef(null);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Mayer Medicare WebView Test</Text>
        <Text style={styles.subtitle}>Free proof test in Expo Go</Text>
      </View>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, active === 'finder' && styles.tabActive]} onPress={() => setActive('finder')}>
          <Text style={[styles.tabText, active === 'finder' && styles.tabTextActive]}>Plan Finder</Text>
        </Pressable>
        <Pressable style={[styles.tab, active === 'medicare' && styles.tabActive]} onPress={() => setActive('medicare')}>
          <Text style={[styles.tabText, active === 'medicare' && styles.tabTextActive]}>Medicare.gov</Text>
        </Pressable>
      </View>

      <View style={styles.webContainer}>
        <View pointerEvents={active === 'finder' ? 'auto' : 'none'} style={[styles.webLayer, active === 'finder' ? styles.visible : styles.hidden]}>
          <WebView
            ref={finderRef}
            source={{ uri: FINDER_URL }}
            javaScriptEnabled
            domStorageEnabled
            cacheEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows={false}
            onLoadEnd={() => setFinderLoading(false)}
          />
          {finderLoading && <View style={styles.loader}><ActivityIndicator size="large" /><Text>Loading Finder…</Text></View>}
        </View>

        <View pointerEvents={active === 'medicare' ? 'auto' : 'none'} style={[styles.webLayer, active === 'medicare' ? styles.visible : styles.hidden]}>
          <WebView
            ref={medicareRef}
            source={{ uri: MEDICARE_URL }}
            javaScriptEnabled
            domStorageEnabled
            cacheEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows={false}
            onLoadEnd={() => setMedicareLoading(false)}
          />
          {medicareLoading && <View style={styles.loader}><ActivityIndicator size="large" /><Text>Loading Medicare.gov…</Text></View>}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderRadius: 8 },
  tabActive: { backgroundColor: '#111111' },
  tabText: { fontWeight: '600' },
  tabTextActive: { color: '#ffffff' },
  webContainer: { flex: 1, position: 'relative' },
  webLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  visible: { opacity: 1, zIndex: 2 },
  hidden: { opacity: 0, zIndex: 1 },
  loader: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', gap: 10 }
});
