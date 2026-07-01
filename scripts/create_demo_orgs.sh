#!/bin/bash

mongosh --quiet --eval "
use('test_database');

// Create 2 organizations
const org1Id = 'org_demo001';
const org2Id = 'org_demo002';

// Update/Create Organization 1
db.organizations.updateOne(
  { organization_id: org1Id },
  { 
    \$set: {
      organization_id: org1Id,
      name: 'Barbería Elite',
      owner_id: 'user_owner001',
      created_at: new Date().toISOString()
    }
  },
  { upsert: true }
);

// Create Organization 2
db.organizations.updateOne(
  { organization_id: org2Id },
  { 
    \$set: {
      organization_id: org2Id,
      name: 'Estilo & Corte',
      owner_id: 'user_owner001',
      created_at: new Date().toISOString()
    }
  },
  { upsert: true }
);

print('✅ Created 2 organizations: Barbería Elite, Estilo & Corte');

// Create users for Organization 1
const users1 = [
  {
    user_id: 'user_manager001',
    email: 'manager1@barberia-elite.com',
    name: 'Carlos Rodríguez',
    role: 'manager',
    access_status: 'approved',
    organization_id: org1Id,
    created_at: new Date().toISOString()
  },
  {
    user_id: 'user_staff001',
    email: 'barbero1@barberia-elite.com',
    name: 'Juan Martínez',
    role: 'manager',
    access_status: 'approved',
    organization_id: org1Id,
    created_at: new Date().toISOString()
  },
  {
    user_id: 'user_pending001',
    email: 'pending1@barberia-elite.com',
    name: 'Pedro Sánchez',
    role: 'manager',
    access_status: 'pending',
    organization_id: org1Id,
    created_at: new Date().toISOString()
  }
];

// Create users for Organization 2
const users2 = [
  {
    user_id: 'user_manager002',
    email: 'manager2@estilo-corte.com',
    name: 'María González',
    role: 'manager',
    access_status: 'approved',
    organization_id: org2Id,
    created_at: new Date().toISOString()
  },
  {
    user_id: 'user_staff002',
    email: 'barbero2@estilo-corte.com',
    name: 'Luis Fernández',
    role: 'manager',
    access_status: 'approved',
    organization_id: org2Id,
    created_at: new Date().toISOString()
  },
  {
    user_id: 'user_pending002',
    email: 'pending2@estilo-corte.com',
    name: 'Ana López',
    role: 'manager',
    access_status: 'pending',
    organization_id: org2Id,
    created_at: new Date().toISOString()
  }
];

// Insert users (update if exists)
[...users1, ...users2].forEach(user => {
  db.users.updateOne(
    { email: user.email },
    { \$set: user },
    { upsert: true }
  );
});

print('✅ Created 6 demo users:');
print('  Barbería Elite: 2 approved + 1 pending');
print('  Estilo & Corte: 2 approved + 1 pending');

// Add services to each org
const services1 = [
  { service_id: 'service_001', organization_id: org1Id, name: 'Corte Clásico', duration: 30, price: 25.00, created_at: new Date().toISOString() },
  { service_id: 'service_002', organization_id: org1Id, name: 'Corte + Barba', duration: 45, price: 40.00, created_at: new Date().toISOString() }
];

const services2 = [
  { service_id: 'service_101', organization_id: org2Id, name: 'Corte Moderno', duration: 30, price: 30.00, created_at: new Date().toISOString() },
  { service_id: 'service_102', organization_id: org2Id, name: 'Estilo Completo', duration: 60, price: 50.00, created_at: new Date().toISOString() }
];

[...services1, ...services2].forEach(service => {
  db.services.updateOne(
    { service_id: service.service_id },
    { \$set: service },
    { upsert: true }
  );
});

print('✅ Created services for both organizations');

// Summary
print('');
print('=== DEMO SETUP COMPLETE ===');
print('Organization 1: Barbería Elite (org_demo001)');
print('  - manager1@barberia-elite.com (approved)');
print('  - barbero1@barberia-elite.com (approved)');
print('  - pending1@barberia-elite.com (pending)');
print('');
print('Organization 2: Estilo & Corte (org_demo002)');
print('  - manager2@estilo-corte.com (approved)');
print('  - barbero2@estilo-corte.com (approved)');
print('  - pending2@estilo-corte.com (pending)');
"
