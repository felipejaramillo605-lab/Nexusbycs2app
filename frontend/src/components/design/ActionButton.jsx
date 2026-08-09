import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const variants = {
  primary: 'nexus-action-primary',
  secondary: 'nexus-action-secondary',
  ghost: 'nexus-action-ghost',
  destructive: 'nexus-action-destructive'
};

export function ActionButton({ children, icon: Icon, variant = 'primary', loading = false, className, disabled, ...props }) {
  const reduced = useReducedMotion();
  return <motion.button type="button" className={cn('nexus-action-button', variants[variant], className)} whileHover={reduced || disabled ? undefined : { y: -1 }} whileTap={reduced || disabled ? undefined : { scale: 0.97 }} transition={{ type: 'spring', stiffness: 520, damping: 30 }} disabled={disabled || loading} {...props}>
    {loading ? <Loader2 size={17} className="animate-spin"/> : Icon ? <Icon size={17}/> : null}<span>{children}</span>
  </motion.button>;
}
