"""Propuesta de indice para FASE 5 (auditoria de base de datos, 2026-08-11).

NO se ejecuta automaticamente. Felipe y Claude lo revisan primero (ver informe
/app/docs/emergent-reports/2026-08-11-fase5-db-health.md, hallazgo #1).

Uso manual, una sola vez, cuando se apruebe:
    python3 ops/propuestas/indices_2026-08-11.py

Idempotente: create_index con background=True no falla ni duplica si el
indice ya existe con el mismo keyPattern+name.
"""
import asyncio
import os

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    db = AsyncIOMotorClient(mongo_url)[db_name]

    # Busqueda de cliente por telefono dentro de una organizacion (POST /public/{org}/appointments,
    # creacion/edicion de cliente): hoy usa el indice nexus_org_visits_client (organization_id,
    # total_visits, client_id) solo para acotar por organization_id y despues filtra 'phone' en
    # memoria. Con pocos clientes por organizacion no se nota; con miles, es un escaneo completo
    # de los clientes de esa organizacion en cada reserva.
    await db.clients.create_index(
        [("organization_id", 1), ("phone", 1)],
        name="nexus_org_phone_client_lookup",
        background=True,
    )
    print("Indice creado/verificado: clients.nexus_org_phone_client_lookup")


if __name__ == "__main__":
    asyncio.run(main())
