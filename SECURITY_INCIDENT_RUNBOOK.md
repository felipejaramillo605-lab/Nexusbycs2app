# Security Incident Response Runbook - Nexus by CS2

**Last Updated:** December 2025  
**Compliance:** FIPA (Florida Information Protection Act)

---

## 1. Purpose

This runbook outlines the procedures to follow in the event of a security incident or data breach affecting Nexus by CS2. It ensures compliance with FIPA and Colombian data protection laws.

---

## 2. Incident Classification

### Level 1: Critical (Immediate Action Required)
- Unauthorized access to personal data (PII)
- Data breach affecting 500+ individuals
- Ransomware or malware infection
- Complete system compromise

### Level 2: High (Action Required Within 24 Hours)
- Suspicious access patterns
- Failed intrusion attempts
- Potential data leak
- Unauthorized API access

### Level 3: Medium (Monitor and Investigate)
- Multiple failed login attempts
- Unusual traffic patterns
- Configuration changes
- Service disruptions

### Level 4: Low (Log and Review)
- Single failed login
- Minor configuration issues
- False positive alerts

---

## 3. Immediate Response Steps (First 30 Minutes)

### Step 1: Contain the Incident
- [ ] Isolate affected systems
- [ ] Disable compromised user accounts
- [ ] Block suspicious IP addresses
- [ ] Take affected services offline if necessary

### Step 2: Assess the Scope
- [ ] Identify what data was accessed
- [ ] Determine the number of affected individuals
- [ ] Document the timeline of events
- [ ] Preserve logs and evidence

### Step 3: Notify Key Personnel
- [ ] Alert the technical team
- [ ] Notify management/ownership
- [ ] Contact legal counsel (if needed)
- [ ] Prepare for external notifications

---

## 4. Investigation Phase (First 24-48 Hours)

### Data Collection:
```bash
# Backend logs
tail -1000 /var/log/supervisor/backend.err.log > incident_backend_$(date +%Y%m%d).log

# MongoDB access logs (if available)
# Review authentication logs

# Network access logs
# Check firewall and ingress logs
```

### Key Questions to Answer:
1. What data was compromised?
   - Names, phone numbers, emails?
   - Appointment history?
   - Payment information?

2. How many individuals were affected?
   - Per organization
   - Total across all tenants

3. How did the breach occur?
   - Vulnerability exploited
   - Stolen credentials
   - Insider threat
   - Third-party compromise

4. When did it start and end?
   - First suspicious activity
   - Last known compromise
   - When was it detected

---

## 5. Legal Notification Requirements

### 🇺🇸 Florida (FIPA Compliance)

**If 500+ Florida residents are affected:**
- **Timeline:** Notify within 30 days of discovery
- **Who to notify:**
  - Affected individuals (direct notification)
  - Florida Department of Legal Affairs
    - Email: fldatacompliance@myfloridalegal.com
    - Website: myfloridalegal.com

**Notification must include:**
- Date of breach
- Type of data compromised
- Actions taken to protect data
- Contact information for questions
- Steps individuals can take

### 🇨🇴 Colombia (Ley 1581)

**If Colombian residents are affected:**
- **Timeline:** Immediate notification to SIC (Superintendencia de Industria y Comercio)
- **Who to notify:**
  - Superintendencia de Industria y Comercio (SIC)
  - Website: www.sic.gov.co
  - Line: 018000 910165
  - Affected individuals

---

## 6. Communication Templates

### Template 1: Individual Notification Email

```
Subject: Important Security Notice - Nexus by CS2

Dear [Customer Name],

We are writing to inform you of a security incident that may have affected your personal information.

**What Happened:**
On [DATE], we discovered [BRIEF DESCRIPTION].

**What Information Was Involved:**
[List of data types: name, phone, email, etc.]

**What We Are Doing:**
- [Actions taken to secure systems]
- [Investigation underway]
- [Additional security measures]

**What You Can Do:**
- Monitor your accounts for suspicious activity
- Change your password if you use the same password elsewhere
- Be cautious of phishing attempts

**Your Rights:**
Under Florida law (FIPA) and Colombian law (Ley 1581), you have the right to:
- Access your data
- Request deletion
- File a complaint with authorities

**Contact Us:**
[Contact information]

We sincerely apologize for this incident and any inconvenience it may cause.

Sincerely,
Nexus by CS2 Team
```

### Template 2: Authority Notification

```
To: Florida Department of Legal Affairs / SIC Colombia
From: [Your Company Name]
Date: [DATE]
Re: Data Breach Notification

[Formal notification with all required details]
```

---

## 7. Post-Incident Review (Within 7 Days)

### Root Cause Analysis:
- [ ] What was the vulnerability?
- [ ] Why wasn't it detected earlier?
- [ ] What controls failed?

### Remediation Plan:
- [ ] Fix the vulnerability
- [ ] Enhance monitoring
- [ ] Update security policies
- [ ] Staff training (if needed)

### Documentation:
- [ ] Incident report completed
- [ ] Lessons learned document
- [ ] Updated security procedures
- [ ] Evidence preserved (for legal/audit)

---

## 8. Prevention Checklist

### Technical Controls:
- [ ] Keep all dependencies updated
- [ ] Use secrets management (no hardcoded credentials)
- [ ] Enable MFA for all admin accounts
- [ ] Regular security audits
- [ ] Penetration testing (annual)
- [ ] Automated vulnerability scanning

### Operational Controls:
- [ ] Access review (quarterly)
- [ ] Log monitoring and alerting
- [ ] Backup verification
- [ ] Incident response drills (annual)
- [ ] Security awareness training

### Compliance Controls:
- [ ] Privacy policy up to date
- [ ] Terms of service reviewed
- [ ] Data retention policy enforced
- [ ] ARCO rights processes documented
- [ ] Vendor security assessments

---

## 9. Key Contacts

### Internal:
- **Technical Lead:** [Name, Phone, Email]
- **Management:** [Name, Phone, Email]
- **Legal Counsel:** [Name, Phone, Email]

### External:
- **Florida Dept of Legal Affairs:** fldatacompliance@myfloridalegal.com
- **SIC Colombia:** www.sic.gov.co, 018000 910165
- **Hosting Provider:** [Contact]
- **MongoDB Support:** [Contact]

---

## 10. Environment Variable Security

### Critical: Never Commit These to Git
```bash
# Backend/.env
MONGO_URL=
SMTP_PASSWORD=
EMERGENT_LLM_KEY=
JWT_SECRET_KEY=

# Frontend/.env
REACT_APP_BACKEND_URL=
```

### Verification:
```bash
# Check .gitignore includes .env
cat .gitignore | grep ".env"

# Verify no secrets in git history
git log -S "password" --all
```

---

## 11. Incident Log Template

```
Incident ID: INC-[YYYYMMDD]-[NUMBER]
Date Detected: 
Severity Level: 
Affected Systems: 
Affected Data: 
Number of Individuals: 
Actions Taken: 
Root Cause: 
Resolution Date: 
Lessons Learned: 
```

---

**Last Review:** December 2025  
**Next Review:** June 2026  
**Owner:** [Technical Lead Name]
