#!/bin/bash

# Script para crear datos de prueba en la base de datos

mongosh --eval "
use('test_database');

// Limpiar datos existentes (opcional)
// db.users.deleteMany({});
// db.organizations.deleteMany({});
// db.services.deleteMany({});
// db.barbers.deleteMany({});
// db.appointments.deleteMany({});
// db.inventory.deleteMany({});

// Crear una organización de ejemplo
const orgId = 'org_demo001';
db.organizations.insertOne({
  organization_id: orgId,
  name: 'Barbería Elegante',
  owner_id: 'user_demo001',
  created_at: new Date().toISOString()
});

// Crear servicios
db.services.insertMany([
  {
    service_id: 'service_001',
    organization_id: orgId,
    name: 'Corte de Cabello',
    duration: 30,
    price: 25.00,
    created_at: new Date().toISOString()
  },
  {
    service_id: 'service_002',
    organization_id: orgId,
    name: 'Corte + Barba',
    duration: 45,
    price: 40.00,
    created_at: new Date().toISOString()
  },
  {
    service_id: 'service_003',
    organization_id: orgId,
    name: 'Arreglo de Cejas',
    duration: 15,
    price: 10.00,
    created_at: new Date().toISOString()
  }
]);

// Crear barberos
db.barbers.insertMany([
  {
    barber_id: 'barber_001',
    organization_id: orgId,
    name: 'Carlos Martínez',
    avatar: null,
    available_days: [1, 2, 3, 4, 5],
    start_time: '09:00',
    end_time: '18:00',
    created_at: new Date().toISOString()
  },
  {
    barber_id: 'barber_002',
    organization_id: orgId,
    name: 'Juan López',
    avatar: null,
    available_days: [1, 2, 3, 4, 5, 6],
    start_time: '10:00',
    end_time: '19:00',
    created_at: new Date().toISOString()
  }
]);

// Crear inventario con algunos items de stock bajo
db.inventory.insertMany([
  {
    item_id: 'item_001',
    organization_id: orgId,
    name: 'Gel para Cabello',
    quantity: 3,
    min_stock: 5,
    unit: 'unidades',
    created_at: new Date().toISOString()
  },
  {
    item_id: 'item_002',
    organization_id: orgId,
    name: 'Hojas de Afeitar',
    quantity: 10,
    min_stock: 15,
    unit: 'paquetes',
    created_at: new Date().toISOString()
  },
  {
    item_id: 'item_003',
    organization_id: orgId,
    name: 'Cera Modeladora',
    quantity: 8,
    min_stock: 5,
    unit: 'unidades',
    created_at: new Date().toISOString()
  },
  {
    item_id: 'item_004',
    organization_id: orgId,
    name: 'Toallas',
    quantity: 15,
    min_stock: 10,
    unit: 'unidades',
    created_at: new Date().toISOString()
  }
]);

// Crear algunas citas para hoy
const today = new Date().toISOString().split('T')[0];
db.appointments.insertMany([
  {
    appointment_id: 'apt_001',
    organization_id: orgId,
    service_id: 'service_001',
    barber_id: 'barber_001',
    client_name: 'Pedro García',
    client_phone: '+1234567890',
    client_email: 'pedro@email.com',
    date: today,
    time: '10:00',
    status: 'confirmed',
    created_at: new Date().toISOString()
  },
  {
    appointment_id: 'apt_002',
    organization_id: orgId,
    service_id: 'service_002',
    barber_id: 'barber_002',
    client_name: 'María Rodríguez',
    client_phone: '+0987654321',
    client_email: 'maria@email.com',
    date: today,
    time: '11:00',
    status: 'confirmed',
    created_at: new Date().toISOString()
  },
  {
    appointment_id: 'apt_003',
    organization_id: orgId,
    service_id: 'service_001',
    barber_id: 'barber_001',
    client_name: 'Luis Fernández',
    client_phone: '+1122334455',
    client_email: 'luis@email.com',
    date: today,
    time: '14:00',
    status: 'confirmed',
    created_at: new Date().toISOString()
  }
]);

print('✅ Datos de prueba creados exitosamente');
print('Organización ID: ' + orgId);
print('Puedes acceder al flujo público en: /book/' + orgId);
"
