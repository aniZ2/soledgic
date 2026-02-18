# Soledgic Data Processing Addendum (DPA)

**Version:** 1.0  
**Last Updated:** December 2024

---

This Data Processing Addendum ("DPA") is incorporated into and forms part of the Agreement between Osifo Holdings, L.L.C. ("Soledgic," "Processor") and the entity identified in the Agreement ("Customer," "Controller").

---

## 1. Definitions

**"Agreement"** means the Terms of Service or Master Service Agreement between the parties.

**"Applicable Data Protection Laws"** means all laws relating to data protection, including GDPR, CCPA/CPRA, and other applicable privacy laws.

**"Controller"** means Customer, who determines the purposes and means of Processing Personal Data.

**"Data Subject"** means an identified or identifiable natural person whose Personal Data is Processed.

**"Personal Data"** means any information relating to a Data Subject that is Processed by Soledgic on behalf of Customer.

**"Processing"** means any operation performed on Personal Data, including collection, storage, use, and deletion.

**"Processor"** means Soledgic, which Processes Personal Data on behalf of Customer.

**"Security Incident"** means any unauthorized access, acquisition, or disclosure of Personal Data.

**"Sub-processor"** means any third party engaged by Soledgic to Process Personal Data on Customer's behalf.

---

## 2. Scope and Roles

### 2.1 Roles

Customer is the Controller of Personal Data submitted to Soledgic. Soledgic is the Processor acting on Customer's documented instructions.

### 2.2 Categories of Data Subjects

- Customer's employees and representatives
- Customer's end users (creators, contractors)
- Customer's customers (transaction data)

### 2.3 Categories of Personal Data

| Category | Examples |
|----------|----------|
| Identification data | Names, email addresses |
| Financial data | Transaction amounts, bank account identifiers |
| Tax data | TINs (SSN/EIN), addresses |
| Technical data | IP addresses, device identifiers |

### 2.4 Processing Activities

- Ledger management and transaction recording
- Bank and payment reconciliation
- Tax document generation
- Report generation and analytics

---

## 3. Customer Obligations

Customer represents and warrants that:

3.1 It has obtained all necessary consents and authorizations to share Personal Data with Soledgic.

3.2 Its instructions to Soledgic comply with Applicable Data Protection Laws.

3.3 It will use Soledgic only for lawful purposes.

3.4 It will notify affected Data Subjects of this data processing as required by law.

---

## 4. Soledgic Obligations

### 4.1 Processing Instructions

Soledgic will Process Personal Data only:
- According to Customer's documented instructions
- As necessary to provide the Service
- As required by applicable law

If Soledgic believes an instruction violates Applicable Data Protection Laws, it will notify Customer.

### 4.2 Confidentiality

Soledgic will ensure that personnel authorized to Process Personal Data:
- Are bound by confidentiality obligations
- Process Personal Data only as instructed
- Receive appropriate training

### 4.3 Security Measures

Soledgic implements technical and organizational measures including:

**Technical Measures:**
- Encryption in transit (TLS 1.3)
- Encryption at rest (AES-256)
- Access controls and authentication
- Network security and firewalls
- Logging and monitoring

**Organizational Measures:**
- Access limited to authorized personnel
- Background checks for personnel
- Security awareness training
- Incident response procedures
- Business continuity planning

Details are provided in Annex II.

### 4.4 Sub-processors

Soledgic may engage Sub-processors subject to:
- Equivalent data protection obligations
- Written contracts with Sub-processors
- Notification to Customer of new Sub-processors

Current Sub-processors are listed in Annex III. Customer has 30 days to object to new Sub-processors.

### 4.5 Data Subject Rights

Soledgic will assist Customer in responding to Data Subject requests (access, rectification, deletion, etc.) by:
- Providing self-service tools where possible
- Responding to requests forwarded by Customer within 10 business days
- Implementing technical measures to fulfill requests

### 4.6 Security Incidents

Upon becoming aware of a Security Incident, Soledgic will:
- Notify Customer within 48 hours
- Provide details of the incident
- Take reasonable steps to mitigate harm
- Cooperate with Customer's investigation
- Assist with regulatory notifications

### 4.7 Data Protection Impact Assessments

Soledgic will provide reasonable assistance if Customer must conduct a data protection impact assessment, to the extent Soledgic has relevant information.

### 4.8 Audits

Upon reasonable notice (at least 30 days), Customer may:
- Request documentation of Soledgic's compliance
- Conduct an audit (or engage a third-party auditor)
- Review audit reports and certifications

Audits shall be conducted during normal business hours, no more than once per year, and at Customer's expense.

---

## 5. International Transfers

### 5.1 Transfer Mechanisms

Personal Data may be transferred to countries outside the EEA/UK using:
- Standard Contractual Clauses (SCCs) — Module 2 (Controller to Processor)
- Other approved transfer mechanisms

### 5.2 SCCs

Where required, the SCCs are incorporated by reference:
- EU Commission Decision 2021/914
- UK International Data Transfer Addendum

The parties agree to the SCCs with Soledgic as "data importer" and Customer as "data exporter."

### 5.3 Additional Safeguards

Soledgic implements additional safeguards including:
- Encryption of data in transit and at rest
- Access controls limiting who can view data
- Policies against government access requests (disclosed where legally permitted)

---

## 6. Data Retention and Deletion

### 6.1 During the Agreement

Soledgic retains Personal Data as long as necessary to provide the Service.

### 6.2 After Termination

Upon termination or expiration of the Agreement:
- Customer may export Personal Data for 30 days
- After 30 days, Soledgic will delete Personal Data
- Exception: Data required for legal compliance (e.g., tax records for 7 years)

### 6.3 Deletion Certification

Upon request, Soledgic will certify in writing that Personal Data has been deleted, except for data retained for legal requirements.

---

## 7. Liability

### 7.1 Allocation

Each party is liable for damages caused by its breach of this DPA or Applicable Data Protection Laws.

### 7.2 Limitation

Liability under this DPA is subject to the limitations in the Agreement, except where such limitations are prohibited by law.

---

## 8. Term

This DPA is effective upon execution of the Agreement and continues until all Personal Data is deleted or returned.

---

## 9. Conflicts

In case of conflict between this DPA and the Agreement, this DPA prevails regarding data protection matters.

---

## Annex I: Processing Details

**Subject Matter:** Accounting infrastructure services

**Duration:** Term of the Agreement

**Nature and Purpose:** Recording transactions, reconciling financial data, generating reports and tax documents

**Types of Personal Data:**
- Names and contact information
- Financial transaction data
- Tax identification numbers
- Bank account identifiers (tokenized)

**Categories of Data Subjects:**
- Customer employees
- Creators/contractors
- End customers (transaction parties)

**Special Categories:** None intentionally processed. Customer should not submit special category data (health, biometric, etc.).

---

## Annex II: Technical and Organizational Security Measures

### Infrastructure Security
- SOC 2 Type II certified hosting (Supabase/AWS)
- Geographic redundancy
- DDoS protection
- Regular penetration testing

### Access Control
- Role-based access control (RBAC)
- Multi-factor authentication for admin access
- API key authentication for programmatic access
- Session management and timeout

### Data Protection
- TLS 1.3 for data in transit
- AES-256 encryption for data at rest
- Separate encryption keys for TIN data
- Database-level row security

### Monitoring and Response
- Real-time security monitoring
- Automated alerting for anomalies
- Incident response playbook
- 24-hour on-call rotation

### Business Continuity
- Daily automated backups
- Point-in-time recovery (7 days)
- Disaster recovery plan (RTO: 4 hours)
- Annual DR testing

### Personnel
- Background checks
- Confidentiality agreements
- Annual security training
- Principle of least privilege

---

## Annex III: Authorized Sub-processors

| Sub-processor | Location | Purpose |
|---------------|----------|---------|
| Supabase, Inc. | USA | Database hosting and authentication |
| Payment Processor, Inc. | USA | Payment processing integration |
| Bank Feed, Inc. | USA | Bank account connectivity |
| Resend, Inc. | USA | Transactional email delivery |
| Vercel, Inc. | USA | Web application hosting |

**Updates:** Customer will be notified via email at least 30 days before engaging new Sub-processors. Objections may be raised within that period.

---

## Annex IV: Standard Contractual Clauses

The EU Standard Contractual Clauses (Commission Implementing Decision 2021/914) are incorporated by reference with the following selections:

**Module:** Module 2 (Controller to Processor)

**Clause 7 (Docking):** Not applicable

**Clause 9 (Sub-processors):** Option 2 (general written authorization)

**Clause 11 (Redress):** Optional clause not included

**Clause 17 (Governing Law):** Laws of Ireland

**Clause 18 (Forum):** Courts of Ireland

**Annex I.A (Parties):**
- Data exporter: Customer (as identified in Agreement)
- Data importer: Osifo Holdings, L.L.C.

**Annex I.B (Processing):** As described in Annex I of this DPA

**Annex I.C (Supervisory Authority):** Irish Data Protection Commission (or Customer's local authority if required)

**Annex II (Technical Measures):** As described in Annex II of this DPA

---

## Signatures

This DPA is effective as of the date Customer accepts the Agreement (for click-through) or the signature date below (for executed agreements).

**For Customer:**

Name: _________________________  
Title: _________________________  
Date: _________________________  
Signature: _________________________

**For Soledgic (Osifo Holdings, L.L.C.):**

Name: _________________________  
Title: _________________________  
Date: _________________________  
Signature: _________________________

---

*To request an executed copy of this DPA, contact legal@soledgic.com.*
