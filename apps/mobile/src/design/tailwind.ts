/**
 * NativeWind turns `className` into `style` on React Native's own components only.
 * Anything else that takes a `style` has to be registered here, once, before it renders.
 */
import { Link } from 'expo-router';
import { cssInterop } from 'nativewind';

cssInterop(Link, { className: 'style' });
