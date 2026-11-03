import { OtpSignIn, SunriseSky, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/api';
import { SIGN_IN } from '@/copy/common';
import { useSession } from '@/session/session-provider';

const LOGO = require('../../../assets/images/logo.png');
const LOGO_NIGHT = require('../../../assets/images/logo-white.png');

/** A calm sky over the rooftop drawing, then the phone-and-code sign-in as a sheet. */
export function SignInScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn } = useSession();
  return (
    // Both platforms: the focused field and its button scroll up above the keyboard.
    <View style={[styles.root, { backgroundColor: theme.colors.canvas }]}>
      <KeyboardAwareScrollView
        bottomOffset={140}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
        bounces={false}
      >
        <View style={{ paddingTop: insets.top }}>
          <SunriseSky
            logo={LOGO}
            logoNight={LOGO_NIGHT}
            logoLabel={SIGN_IN.logoLabel}
            hello={SIGN_IN.hello}
            line={SIGN_IN.line}
          />
        </View>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.canvas,
              paddingBottom: insets.bottom + 28,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />
          <OtpSignIn
            copy={SIGN_IN.form}
            requestCode={async (phone) => {
              await unwrap(api.auth.requestOtp({ body: { phone } }));
            }}
            verifyCode={async (phone, code) => {
              const session = await unwrap(api.auth.verifyOtp({ body: { phone, code } }));
              await signIn(session.token, session.user);
            }}
          />
          <Text variant="bodySm" tone="tertiary" align="center">
            {SIGN_IN.customers}
          </Text>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1 },
  sheet: {
    flexGrow: 1,
    marginTop: -28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 24,
    shadowColor: '#05344D',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -12 },
    elevation: 6,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
});
