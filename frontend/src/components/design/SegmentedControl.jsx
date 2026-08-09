import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/utils';
export function SegmentedControl({ value, onChange, options, className }) {
  const reduced = useReducedMotion();
  return <div className={cn('nexus-segmented', className)}>{options.map(option => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={value === option.value ? 'is-active' : ''}>{value === option.value && <motion.span layoutId="nexus-segment" className="nexus-segment-indicator" transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 430, damping: 35 }}/>}<span className="relative z-10">{option.label}</span></button>)}</div>;
}
