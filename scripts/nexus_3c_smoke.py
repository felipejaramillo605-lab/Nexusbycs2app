#!/usr/bin/env python3
"""Nexus 3C non-destructive security and route smoke checks."""
from pathlib import Path
import json, os, re, time, urllib.error, urllib.request

ROOT=Path('/app')
ORIGIN=os.environ.get('NEXUS_API_ORIGIN','http://127.0.0.1:8001').rstrip('/')
API=ORIGIN+'/api'
REPORT=ROOT/'NEXUS_3C_SMOKE_REPORT.json'
results=[]

# NEXUS_3C_SMOKE_FIX_V2
def check(name,ok,detail=''):
 item={'name':name,'status':'PASS' if ok else 'FAIL','detail':detail}
 results.append(item)
 print(f'{name}={item["status"]}' + (f' ({detail})' if detail else ''))

def request(url,retries=12,delay=1.0):
 last=''
 for attempt in range(1,retries+1):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'Nexus-3C-Smoke/2.0'})
   with urllib.request.urlopen(req,timeout=10) as response:
    return response.status,response.read().decode(),''
  except urllib.error.HTTPError as error:
   return error.code,error.read().decode(),''
  except (urllib.error.URLError,OSError) as error:
   last=str(error)
   if attempt<retries: time.sleep(delay)
 return 0,'',last

def main():
 server=(ROOT/'backend/server.py').read_text(encoding='utf-8')
 frontend='\n'.join(p.read_text(encoding='utf-8',errors='ignore') for p in (ROOT/'frontend/src').rglob('*') if p.suffix in {'.js','.jsx'})
 check('RLS_HELPERS',all(x in server for x in ['validate_organization_access','get_organization_filter','enforce_rls_on_write','require_management_role']))
 check('STRICT_AVAILABILITY',all(x in server for x in ['_strict_booking_context','_strict_slot_is_available','_acquire_booking_lock']))
 check('PUBLIC_TOKEN_HASH',all(x in server for x in ['management_token_hash','secrets.compare_digest']))
 check('BOOKING_LOCK_TTL_STARTUP',all(x in server for x in ['booking_locks_ttl','expireAfterSeconds=0']))
 account_checks={
  'request_model':'class AccountDeletionRequest' in server,
  'delete_route':'@api_router.delete("/account/me")' in server,
  'confirmation_guard':'understood' in server and 'confirmation' in server,
  'session_revocation':'sessions.delete_many' in server or 'db.sessions.delete_many' in server,
  'owner_guard': (
      bool(re.search(r'last.{0,80}owner|owner.{0,80}last', server, re.I | re.S))
      or (
          'count_documents' in server
          and bool(re.search(r'role.{0,80}owner|owner.{0,80}role', server, re.I | re.S))
          and bool(re.search(r'<=\s*1|<\s*2', server))
      )
  ),
 }
 check('ACCOUNT_SAFETY',all(account_checks.values()),','.join(k for k,v in account_checks.items() if not v))
 check('AUTHORIZATION_HARDENING',all(x in server for x in ['NEXUS_AUTHORIZATION_HARDENING_V1','Account access is not approved','Account is inactive','BOOTSTRAP_OWNER_EMAIL']))
 check('NO_IDENTITY_SPECIFIC_OWNER_ESCALATION',not bool(re.search(r'is_owner_email\s*=|always owner|Always update.*owner',server,re.I)))
 check('NATIVE_DIALOGS',not re.search(r'window\.(prompt|confirm|alert)',frontend))
 status,body,error=request(ORIGIN+'/openapi.json')
 check('OPENAPI',status==200,error or str(status))
 if status==200:
  data=json.loads(body);paths=data.get('paths',{})
  required=['/api/public/{org_id}/availability','/api/public/{org_id}/appointments','/api/public/appointments/{appointment_id}','/api/account/me','/api/owner/users']
  missing=[path for path in required if path not in paths]
  check('REQUIRED_ROUTES',not missing,','.join(missing))
 else:
  check('REQUIRED_ROUTES',False,'OpenAPI unavailable')
 status,_,error=request(API+'/public/org_demo001/services')
 check('PUBLIC_SERVICES',status==200,error or str(status))
 status,_,error=request(API+'/owner/users')
 check('OWNER_ROUTE_REQUIRES_AUTH',status in {401,403},error or str(status))
 status,_,error=request(API+'/staff/income/summary')
 check('STAFF_ROUTE_REQUIRES_AUTH',status in {401,403},error or str(status))
 # NEXUS_SESSION_LIFECYCLE_V1
 check('SESSION_LIFECYCLE',all(x in server for x in [
  '_migrate_user_session_dates_and_indexes',
  'user_sessions_token_unique',
  'user_sessions_user_id',
  'user_sessions_ttl',
  '"expires_at": expires_at,',
 ]))
 REPORT.write_text(json.dumps({'origin':ORIGIN,'results':results},indent=2)+'\n',encoding='utf-8')
 failed=[x for x in results if x['status']=='FAIL']
 print(f'REPORT={REPORT}')
 print(f'TOTAL={len(results)} PASS={len(results)-len(failed)} FAIL={len(failed)}')
 return 1 if failed else 0
if __name__=='__main__':raise SystemExit(main())
