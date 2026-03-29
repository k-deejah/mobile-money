# Admin SSO Integration (Okta/SAML)

## Overview

This PR implements comprehensive SSO (Single Sign-On) integration for the admin portal, allowing internal staff to authenticate via corporate identity providers (Okta, Microsoft Entra, or generic SAML).

## Features Implemented

### ✅ Core SSO Functionality

- **Passport.js SAML Strategy** - Industry-standard SAML 2.0 authentication
- **Multiple IdP Support** - Okta, Microsoft Entra (Azure AD), and generic SAML providers
- **Automatic Group-to-Role Mapping** - IdP groups automatically map to RBAC roles
- **SSO-Only Enforcement** - Employees can be required to use SSO authentication
- **Automatic Offboarding** - Users deactivated in IdP are automatically disabled
- **Comprehensive Audit Logging** - All SSO events logged for compliance

### ✅ Database Schema

Created new tables for SSO management:

- `sso_providers` - SSO provider configurations
- `sso_group_role_mappings` - IdP group to RBAC role mappings
- `sso_users` - SSO-specific user data
- `sso_audit_log` - Audit trail for all SSO events

### ✅ API Endpoints

#### SSO Authentication
- `GET /api/auth/sso/providers` - List active SSO providers
- `GET /api/auth/sso/login/:providerId` - Initiate SSO login
- `POST /api/auth/sso/callback/:providerId` - Handle SAML callback

#### Group-to-Role Mappings (Admin Only)
- `GET /api/auth/sso/mappings/:providerId` - Get mappings
- `POST /api/auth/sso/mappings/:providerId` - Add mapping
- `DELETE /api/auth/sso/mappings/:providerId/:groupName` - Remove mapping

#### Audit Log (Admin Only)
- `GET /api/auth/sso/audit/:userId` - Get user's SSO audit log

### ✅ Middleware

- `enforceSSOOnly` - Prevents SSO-only users from using password auth
- `enforceSSOForEmployees` - Requires SSO for employee email domains
- `checkSSOUserStatus` - Validates SSO user account is active
- `attachSSOContext` - Attaches SSO user info to requests
- `validateSSOProvider` - Validates SSO provider exists and is active

### ✅ Configuration

Environment variables for SSO configuration:

```bash
# Enable/disable SSO
SSO_ENABLED=true

# Enforce SSO for employees
SSO_ENFORCE_EMPLOYEES=true
SSO_EMPLOYEE_EMAIL_DOMAIN=company.com

# Okta Configuration
SSO_OKTA_ENABLED=true
SSO_OKTA_NAME=Okta
SSO_OKTA_ENTRY_POINT=https://your-org.okta.com/app/your-app/sso/saml
SSO_OKTA_ISSUER=http://www.okta.com/your-issuer-id
SSO_OKTA_CERT=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
SSO_OKTA_CALLBACK_URL=http://localhost:3000/api/auth/sso/callback/okta

# Microsoft Entra Configuration
SSO_ENTRA_ENABLED=true
SSO_ENTRA_NAME=Entra
SSO_ENTRA_ENTRY_POINT=https://login.microsoftonline.com/your-tenant-id/saml2
SSO_ENTRA_ISSUER=https://sts.windows.net/your-tenant-id/
SSO_ENTRA_CERT=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
SSO_ENTRA_CALLBACK_URL=http://localhost:3000/api/auth/sso/callback/entra
```

## Files Changed

### New Files

1. **`database/migrations/009_add_sso_support.sql`**
   - Database migration for SSO tables
   - Indexes and triggers for performance
   - Audit log table for compliance

2. **`src/auth/sso.ts`**
   - SSOService class with singleton pattern
   - Passport.js SAML strategy implementation
   - Group-to-role mapping logic
   - User management and offboarding
   - SSO router with all endpoints

3. **`src/config/sso.ts`**
   - SSO configuration loader
   - Environment variable parsing
   - Configuration validation
   - Provider initialization

4. **`src/middleware/ssoEnforcement.ts`**
   - SSO-only enforcement middleware
   - Employee SSO requirement middleware
   - SSO user status validation
   - SSO context attachment
   - Provider validation

5. **`docs/SSO_INTEGRATION.md`**
   - Comprehensive SSO documentation
   - Architecture overview
   - Configuration guide
   - API reference
   - Troubleshooting guide

### Modified Files

1. **`src/routes/auth.ts`**
   - Added SSO router mount at `/api/auth/sso`
   - Imported SSO enforcement middleware

2. **`.env.example`**
   - Added SSO environment variables
   - Okta configuration examples
   - Microsoft Entra configuration examples
   - Generic SAML configuration examples

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Browser  │───▶│  Admin Portal    │───▶│  SSO Provider   │
│                 │    │  (Express App)   │    │  (Okta/Entra)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   PostgreSQL     │    │  SAML Response  │
                       │   (SSO Users,    │    │  (Groups, etc.) │
                       │    Mappings)     │    └─────────────────┘
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │     Redis        │
                       │  (SSO Sessions)  │
                       └──────────────────┘
```

## How It Works

### 1. SSO Login Flow

1. User clicks "Login with SSO" on admin portal
2. User selects their SSO provider (Okta/Entra)
3. User is redirected to IdP login page
4. User authenticates with IdP credentials
5. IdP sends SAML response to callback URL
6. System validates SAML response and extracts user info
7. System creates/updates user and maps groups to roles
8. System generates JWT token and refresh token
9. User is logged into admin portal

### 2. Automatic Group-to-Role Mapping

When a user logs in via SSO:

1. System extracts groups from SAML response
2. System looks up group-to-role mappings for the provider
3. System assigns the highest priority role based on groups
4. Role assignment is logged in audit trail

**Role Priority:**
- `admin` - Full system access
- `user` - Standard user access
- `viewer` - Read-only access

### 3. SSO-Only Enforcement

For employees with company email addresses:

1. System checks if `SSO_ENFORCE_EMPLOYEES=true`
2. System validates email domain matches `SSO_EMPLOYEE_EMAIL_DOMAIN`
3. If match, password-based authentication is blocked
4. User is redirected to SSO login

### 4. Automatic Offboarding

When a user is deactivated in IdP:

1. IdP sends SAML Logout Request (SLO)
2. System receives SLO request
3. System marks SSO user as inactive
4. System logs deactivation event
5. User cannot login until reactivated

## Security Features

1. **Certificate Validation** - SAML responses are validated against IdP certificates
2. **HTTPS Required** - SSO callbacks must use HTTPS in production
3. **Session Management** - Redis-backed SSO session tracking
4. **Audit Logging** - All SSO events logged with timestamps
5. **Group Validation** - Group memberships validated before role assignment
6. **Automatic Offboarding** - Users deactivated when they leave organization

## Testing

### Manual Testing

1. **Configure SSO provider** in `.env`
2. **Run migration:**
   ```bash
   psql -d your_database -f database/migrations/009_add_sso_support.sql
   ```
3. **Initialize providers:**
   ```typescript
   import { initializeSSOProviders } from './src/config/sso';
   await initializeSSOProviders();
   ```
4. **Test SSO login:**
   ```bash
   curl http://localhost:3000/api/auth/sso/providers
   ```
5. **Add group mappings:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/sso/mappings/:providerId \
     -H "Content-Type: application/json" \
     -d '{"sso_group_name": "Admins", "role_id": "admin-role-uuid"}'
   ```

### Automated Testing

Run the test suite:

```bash
npm test -- sso.test.ts
```

## Acceptance Criteria

✅ **Seamless login for staff**
- Users can login via SSO with a single click
- Automatic role assignment based on IdP groups
- No manual account creation required

✅ **Automatic offboarding via IdP**
- Users deactivated in IdP are automatically disabled
- Audit trail for all deactivation events
- Prevents access until reactivated

✅ **SSO-only enforcement for employees**
- Employees with company email must use SSO
- Password-based auth blocked for employees
- Clear error messages with SSO provider info

✅ **Comprehensive audit logging**
- All SSO events logged with timestamps
- User, group, and role changes tracked
- IP address and user agent recorded

## Migration Path

### From Password Auth to SSO

1. **Run database migration**
2. **Configure SSO providers** in `.env`
3. **Initialize providers** via script
4. **Add group-to-role mappings** via API
5. **Test with pilot users**
6. **Rollout to all staff**

### Rollback Plan

1. **Disable SSO** via `SSO_ENABLED=false`
2. **Revert database migration** if needed
3. **Users can still use password auth** (if not SSO-only)

## Performance Considerations

1. **Caching** - SSO provider configs cached in memory
2. **Database Indexes** - Proper indexes on SSO tables
3. **Redis Sessions** - SSO sessions stored in Redis
4. **Connection Pooling** - Uses existing DB connection pool

## Compliance

- **Audit Trail** - All SSO events logged for compliance
- **User Tracking** - Track which users accessed system via SSO
- **Group Changes** - Log when user groups/roles change
- **Offboarding** - Automatic deactivation when users leave

## Documentation

Comprehensive documentation created in `docs/SSO_INTEGRATION.md`:

- Architecture overview
- Database schema
- Configuration guide
- API reference
- Troubleshooting guide
- Security considerations
- Migration guide

## Dependencies Added

- `passport` - Authentication middleware
- `passport-saml` - SAML 2.0 strategy for Passport
- `@types/passport` - TypeScript definitions
- `@types/passport-saml` - TypeScript definitions

## Breaking Changes

None. This is a new feature that doesn't affect existing authentication methods.

## Next Steps

1. **Configure SSO providers** in production environment
2. **Add group-to-role mappings** for your organization
3. **Test with pilot users** before full rollout
4. **Monitor audit logs** for any issues
5. **Train staff** on SSO login process

## Support

For issues or questions:

1. Check audit log: `GET /api/auth/sso/audit/:userId`
2. Review SSO config: `GET /api/auth/sso/providers`
3. Verify mappings: `GET /api/auth/sso/mappings/:providerId`
4. Check logs for `[SSO]` prefixed messages
5. Refer to `docs/SSO_INTEGRATION.md`
