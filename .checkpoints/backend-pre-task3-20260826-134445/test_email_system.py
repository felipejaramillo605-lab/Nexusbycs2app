"""
🧪 TEST SCRIPT - Sistema de Notificaciones de Email
Envía emails de prueba para validar la configuración SMTP

Destinatarios:
- nexusbycs2@gmail.com
- felipejaramillo605@gmail.com
"""
import sys
from pathlib import Path
from datetime import datetime, timezone

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from email_service import email_service

def test_appointment_confirmation():
    """Prueba email de confirmación de cita"""
    print("\n" + "="*60)
    print("📧 TEST 1: EMAIL DE CONFIRMACIÓN DE CITA")
    print("="*60 + "\n")
    
    test_recipients = [
        "nexusbycs2@gmail.com",
        "felipejaramillo605@gmail.com"
    ]
    
    results = []
    
    for email in test_recipients:
        print(f"📤 Enviando a: {email}")
        success = email_service.send_appointment_confirmation(
            to_email=email,
            customer_name="Felipe Jaramillo (Prueba)",
            barber_name="Carlos Martínez",
            service_name="Corte Premium + Barba",
            date="2025-01-15",
            time="10:30 AM",
            organization_name="Barbería Nexus CS2",
            organization_address="Calle 123 #45-67, Bogotá, Colombia"
        )
        
        if success:
            print(f"   ✅ Enviado exitosamente a {email}\n")
            results.append({"email": email, "status": "success", "type": "confirmation"})
        else:
            print(f"   ❌ FALLÓ el envío a {email}\n")
            results.append({"email": email, "status": "failed", "type": "confirmation"})
    
    return results

def test_appointment_reminder():
    """Prueba email de recordatorio de cita"""
    print("\n" + "="*60)
    print("🔔 TEST 2: EMAIL DE RECORDATORIO DE CITA (24H ANTES)")
    print("="*60 + "\n")
    
    test_recipients = [
        "nexusbycs2@gmail.com",
        "felipejaramillo605@gmail.com"
    ]
    
    results = []
    
    for email in test_recipients:
        print(f"📤 Enviando a: {email}")
        success = email_service.send_appointment_reminder(
            to_email=email,
            customer_name="Felipe Jaramillo (Prueba)",
            barber_name="Carlos Martínez",
            service_name="Corte Premium + Barba",
            date="2025-01-15",
            time="10:30 AM",
            organization_name="Barbería Nexus CS2",
            organization_phone="+57 300 123 4567"
        )
        
        if success:
            print(f"   ✅ Enviado exitosamente a {email}\n")
            results.append({"email": email, "status": "success", "type": "reminder"})
        else:
            print(f"   ❌ FALLÓ el envío a {email}\n")
            results.append({"email": email, "status": "failed", "type": "reminder"})
    
    return results

def test_appointment_cancelled():
    """Prueba email de cancelación de cita"""
    print("\n" + "="*60)
    print("❌ TEST 3: EMAIL DE CANCELACIÓN DE CITA")
    print("="*60 + "\n")
    
    test_recipients = [
        "nexusbycs2@gmail.com",
        "felipejaramillo605@gmail.com"
    ]
    
    results = []
    
    for email in test_recipients:
        print(f"📤 Enviando a: {email}")
        success = email_service.send_appointment_cancelled(
            to_email=email,
            customer_name="Felipe Jaramillo (Prueba)",
            date="2025-01-15",
            time="10:30 AM",
            organization_name="Barbería Nexus CS2"
        )
        
        if success:
            print(f"   ✅ Enviado exitosamente a {email}\n")
            results.append({"email": email, "status": "success", "type": "cancellation"})
        else:
            print(f"   ❌ FALLÓ el envío a {email}\n")
            results.append({"email": email, "status": "failed", "type": "cancellation"})
    
    return results

def test_appointment_completed():
    """Prueba email de agradecimiento post-cita"""
    print("\n" + "="*60)
    print("✨ TEST 4: EMAIL DE AGRADECIMIENTO (POST-CITA)")
    print("="*60 + "\n")
    
    test_recipients = [
        "nexusbycs2@gmail.com",
        "felipejaramillo605@gmail.com"
    ]
    
    results = []
    
    for email in test_recipients:
        print(f"📤 Enviando a: {email}")
        success = email_service.send_appointment_completed(
            to_email=email,
            customer_name="Felipe Jaramillo (Prueba)",
            organization_name="Barbería Nexus CS2",
            date="2025-01-14",
            service_name="Corte Premium + Barba"
        )
        
        if success:
            print(f"   ✅ Enviado exitosamente a {email}\n")
            results.append({"email": email, "status": "success", "type": "completed"})
        else:
            print(f"   ❌ FALLÓ el envío a {email}\n")
            results.append({"email": email, "status": "failed", "type": "completed"})
    
    return results

def test_admin_notification():
    """Prueba email de notificación al administrador"""
    print("\n" + "="*60)
    print("🔔 TEST 5: NOTIFICACIÓN AL ADMINISTRADOR (NUEVA RESERVA)")
    print("="*60 + "\n")
    
    admin_email = "felipejaramillo605@gmail.com"
    
    print(f"📤 Enviando a: {admin_email}")
    success = email_service.send_admin_new_appointment_notification(
        admin_email=admin_email,
        customer_name="María González",
        customer_phone="+57 310 987 6543",
        service_name="Corte Premium + Barba",
        barber_name="Carlos Martínez",
        date="2025-01-15",
        time="10:30 AM",
        organization_name="Barbería Nexus CS2"
    )
    
    if success:
        print(f"   ✅ Enviado exitosamente a {admin_email}\n")
        return [{"email": admin_email, "status": "success", "type": "admin_notification"}]
    else:
        print(f"   ❌ FALLÓ el envío a {admin_email}\n")
        return [{"email": admin_email, "status": "failed", "type": "admin_notification"}]

def print_summary(all_results):
    """Imprime resumen final de pruebas"""
    print("\n" + "="*60)
    print("📊 RESUMEN DE PRUEBAS")
    print("="*60 + "\n")
    
    total = len(all_results)
    success = sum(1 for r in all_results if r["status"] == "success")
    failed = total - success
    
    print(f"Total de emails enviados: {total}")
    print(f"✅ Exitosos: {success}")
    print(f"❌ Fallidos: {failed}")
    print(f"📈 Tasa de éxito: {(success/total*100):.1f}%\n")
    
    if failed > 0:
        print("⚠️  EMAILS FALLIDOS:")
        for r in all_results:
            if r["status"] == "failed":
                print(f"   - {r['email']} ({r['type']})")
        print()
    
    if success == total:
        print("🎉 ¡TODOS LOS EMAILS SE ENVIARON CORRECTAMENTE!")
        print("✅ Sistema de notificaciones funcionando al 100%\n")
    elif success > 0:
        print("⚠️  Sistema funciona parcialmente. Revisa los errores arriba.")
    else:
        print("❌ SISTEMA NO FUNCIONAL. Revisa la configuración SMTP en .env")
        print("   Verifica SMTP_PASSWORD y las credenciales de Gmail.\n")
    
    print("="*60)
    print("📧 REVISA TUS BANDEJAS DE ENTRADA:")
    print("   - nexusbycs2@gmail.com")
    print("   - felipejaramillo605@gmail.com")
    print("   (Revisa también carpeta de SPAM)")
    print("="*60 + "\n")

if __name__ == "__main__":
    print("\n")
    print("🚀 INICIANDO AUDITORÍA DEL SISTEMA DE EMAILS - NEXUS BY CS2")
    print("⏰ " + datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"))
    print("📧 SMTP: nexusbycs2@gmail.com")
    print()
    
    all_results = []
    
    try:
        # Test 1: Confirmación
        all_results.extend(test_appointment_confirmation())
        
        # Test 2: Recordatorio
        all_results.extend(test_appointment_reminder())
        
        # Test 3: Cancelación
        all_results.extend(test_appointment_cancelled())
        
        # Test 4: Agradecimiento
        all_results.extend(test_appointment_completed())
        
        # Test 5: Notificación Admin
        all_results.extend(test_admin_notification())
        
        # Resumen final
        print_summary(all_results)
        
    except Exception as e:
        print(f"\n❌ ERROR CRÍTICO: {str(e)}\n")
        print("Verifica que:")
        print("  1. SMTP_PASSWORD esté configurado en /app/backend/.env")
        print("  2. Las credenciales de Gmail sean correctas")
        print("  3. El backend tenga acceso a internet")
        print()
        sys.exit(1)
