import React, { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { WebView, type WebViewNavigation } from 'react-native-webview'

type ViewName = 'finder' | 'medicare'

const FINDER_URL = 'https://medicare.mayerig.com/?appShell=1'
const MEDICARE_LOGIN_URL = 'https://www.medicare.gov/account/login'

export default function App() {
  const [activeView, setActiveView] = useState<ViewName>('finder')
  const [finderCanGoBack, setFinderCanGoBack] = useState(false)
  const [medicareCanGoBack, setMedicareCanGoBack] = useState(false)

  const finderRef = useRef<WebView>(null)
  const medicareRef = useRef<WebView>(null)

  const activeRef = activeView === 'finder' ? finderRef : medicareRef
  const activeCanGoBack = activeView === 'finder' ? finderCanGoBack : medicareCanGoBack

  function updateNavigation(view: ViewName, nav: WebViewNavigation) {
    if (view === 'finder') setFinderCanGoBack(nav.canGoBack)
    else setMedicareCanGoBack(nav.canGoBack)
  }

  function renderLoading() {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading secure page…</Text>
      </View>
    )
  }

  function renderError(_domain: string | undefined, code: number, description: string) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorTitle}>This page could not load.</Text>
        <Text style={styles.errorText}>{description || `Error ${code}`}</Text>
        <Pressable style={styles.errorButton} onPress={() => activeRef.current?.reload()}>
          <Text style={styles.errorButtonText}>Reload</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.topBar}>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>Mayer Insurance Group</Text>
          <Text style={styles.subtitle}>Medicare Workspace</Text>
        </View>

        <View style={styles.tabs}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeView === 'finder' }}
            onPress={() => setActiveView('finder')}
            style={[styles.tab, activeView === 'finder' && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeView === 'finder' && styles.tabTextActive]}>Plan Finder</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeView === 'medicare' }}
            onPress={() => setActiveView('medicare')}
            style={[styles.tab, activeView === 'medicare' && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeView === 'medicare' && styles.tabTextActive]}>Medicare.gov</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.browserBar}>
        <Pressable
          disabled={!activeCanGoBack}
          onPress={() => activeRef.current?.goBack()}
          style={[styles.browserButton, !activeCanGoBack && styles.browserButtonDisabled]}
        >
          <Text style={styles.browserButtonText}>‹ Back</Text>
        </Pressable>
        <Pressable onPress={() => activeRef.current?.reload()} style={styles.browserButton}>
          <Text style={styles.browserButtonText}>Reload</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.locationText}>
          {activeView === 'finder' ? 'medicare.mayerig.com' : 'medicare.gov'}
        </Text>
      </View>

      <View style={styles.stage}>
        <View
          pointerEvents={activeView === 'finder' ? 'auto' : 'none'}
          style={[styles.webLayer, activeView === 'finder' ? styles.webLayerActive : styles.webLayerHidden]}
        >
          <WebView
            ref={finderRef}
            source={{ uri: FINDER_URL }}
            originWhitelist={['https://*']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            cacheEnabled
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            mixedContentMode="never"
            startInLoadingState
            renderLoading={renderLoading}
            renderError={renderError}
            onNavigationStateChange={(nav) => updateNavigation('finder', nav)}
          />
        </View>

        <View
          pointerEvents={activeView === 'medicare' ? 'auto' : 'none'}
          style={[styles.webLayer, activeView === 'medicare' ? styles.webLayerActive : styles.webLayerHidden]}
        >
          <WebView
            ref={medicareRef}
            source={{ uri: MEDICARE_LOGIN_URL }}
            originWhitelist={['https://*']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            cacheEnabled
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            mixedContentMode="never"
            startInLoadingState
            renderLoading={renderLoading}
            renderError={renderError}
            onNavigationStateChange={(nav) => updateNavigation('medicare', nav)}
          />
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eef3f6',
  },
  topBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#cfd8df',
  },
  brandBlock: {
    marginBottom: 8,
  },
  brand: {
    color: '#0011f6',
    fontWeight: '800',
    fontSize: 16,
  },
  subtitle: {
    color: '#526170',
    fontSize: 12,
    marginTop: 1,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bcc9d2',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7f9fa',
  },
  tabActive: {
    borderColor: '#0011f6',
    backgroundColor: '#0011f6',
  },
  tabText: {
    color: '#243342',
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  browserBar: {
    height: 44,
    paddingHorizontal: 8,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    backgroundColor: '#f6f7f8',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#cfd8df',
  },
  browserButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c8d2da',
  },
  browserButtonDisabled: {
    opacity: 0.35,
  },
  browserButtonText: {
    color: '#173856',
    fontSize: 13,
    fontWeight: '700',
  },
  locationText: {
    flex: 1,
    textAlign: 'right',
    color: '#667581',
    fontSize: 12,
  },
  stage: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#ffffff',
  },
  webLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#ffffff',
  },
  webLayerActive: {
    opacity: 1,
    zIndex: 2,
  },
  webLayerHidden: {
    opacity: 0,
    zIndex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 10,
    color: '#5c6b78',
  },
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#172033',
  },
  errorText: {
    marginTop: 8,
    textAlign: 'center',
    color: '#687684',
  },
  errorButton: {
    marginTop: 18,
    borderRadius: 9,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#0011f6',
  },
  errorButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
})
