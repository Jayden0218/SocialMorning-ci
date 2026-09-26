/**
 * NativeWind turns `className` into `style` on React Native's own components only.
 * Anything else that takes a `style` has to be registered here, once, before it renders.
 * `jest.tailwind.js` imports this file too, so the tests style the same components.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import { cssInterop } from 'nativewind';
import { SafeAreaView } from 'react-native';

cssInterop(Link, { className: 'style' });
cssInterop(LinearGradient, { className: 'style' });
cssInterop(SafeAreaView, { className: 'style' });
