package core

import (
	"errors"
	"strings"
	"testing"
)

type memStore map[string][]byte

func (m memStore) Get(k string) ([]byte, error) { return m[k], nil }
func (m memStore) Put(k string, v []byte) error { m[k] = v; return nil }

var h1 = strings.Repeat("a", 64)
var h2 = strings.Repeat("b", 64)

func TestCredentialLifecycle(t *testing.T) {
	r := Rules{S: memStore{}}
	if _, err := r.IssueCredential(BankMSP, "CRED-1", "STU-1", h1); !errors.Is(err, ErrForbidden) {
		t.Fatalf("bank must not issue credentials, got %v", err)
	}
	if _, err := r.IssueCredential(SchoolMSP, "CRED-1", "STU-1", "nothex"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("bad hash must be rejected, got %v", err)
	}
	if _, err := r.IssueCredential(SchoolMSP, "CRED-1", "STU-1", h1); err != nil {
		t.Fatal(err)
	}
	if _, err := r.IssueCredential(SchoolMSP, "CRED-1", "STU-1", h1); !errors.Is(err, ErrExists) {
		t.Fatalf("duplicate credential id must be rejected, got %v", err)
	}
	if ok, _, _ := r.VerifyCredential("CRED-1", h1); !ok {
		t.Fatal("matching hash must verify")
	}
	if ok, why, _ := r.VerifyCredential("CRED-1", h2); ok || why != "document does not match the sealed hash" {
		t.Fatalf("tampered document must fail, got %v %q", ok, why)
	}
	if err := r.RevokeCredential(TrainingMSP, "CRED-1"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("only the issuer may revoke, got %v", err)
	}
	if err := r.RevokeCredential(SchoolMSP, "CRED-1"); err != nil {
		t.Fatal(err)
	}
	if ok, why, _ := r.VerifyCredential("CRED-1", h1); ok || why != "credential revoked by issuer" {
		t.Fatalf("revoked credential must fail, got %v %q", ok, why)
	}
}

func TestEntitlementIsSingleUsePerStudentPerScheme(t *testing.T) {
	r := Rules{S: memStore{}}
	if _, err := r.CreateEntitlement(SchoolMSP, "ENT-1", "OPP-02", "STU-1", 1500000); !errors.Is(err, ErrForbidden) {
		t.Fatalf("only the authority creates entitlements, got %v", err)
	}
	if _, err := r.CreateEntitlement(AuthorityMSP, "ENT-1", "OPP-02", "STU-1", 0); !errors.Is(err, ErrInvalid) {
		t.Fatalf("zero amount must be rejected, got %v", err)
	}
	if _, err := r.CreateEntitlement(AuthorityMSP, "ENT-1", "OPP-02", "STU-1", 1500000); err != nil {
		t.Fatal(err)
	}
	if _, err := r.CreateEntitlement(AuthorityMSP, "ENT-2", "OPP-02", "STU-1", 1500000); !errors.Is(err, ErrExists) {
		t.Fatalf("second entitlement for same student and scheme must fail, got %v", err)
	}
	if _, err := r.CreateEntitlement(AuthorityMSP, "ENT-2", "OPP-02", "STU-2", 1500000); err != nil {
		t.Fatalf("a different student may claim the same scheme: %v", err)
	}
}

func TestMilestoneNeedsTwoDifferentOrganisations(t *testing.T) {
	r := Rules{S: memStore{}}
	if _, err := r.CreateEntitlement(AuthorityMSP, "ENT-1", "OPP-02", "STU-1", 1500000); err != nil {
		t.Fatal(err)
	}
	if _, err := r.AttestMilestone(BankMSP, "ENT-1"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("bank cannot attest, got %v", err)
	}
	e, err := r.AttestMilestone(SchoolMSP, "ENT-1")
	if err != nil || e.Status != StatusPending {
		t.Fatalf("first attestation should leave it pending: %v %v", e, err)
	}
	if _, err := r.AttestMilestone(SchoolMSP, "ENT-1"); !errors.Is(err, ErrExists) {
		t.Fatalf("same organisation twice must fail, got %v", err)
	}
	e, err = r.AttestMilestone(TrainingMSP, "ENT-1")
	if err != nil || e.Status != StatusReleased {
		t.Fatalf("second distinct attestation should release: %v %v", e, err)
	}
	if _, err := r.AttestMilestone(EmployerMSP, "ENT-1"); !errors.Is(err, ErrExists) {
		t.Fatalf("released entitlement accepts no more attestations, got %v", err)
	}
	if _, err := r.AttestMilestone(SchoolMSP, "ENT-404"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown entitlement must be not found, got %v", err)
	}
}

func TestDrunixTestNetworkOrgsCanRunTheFullFlow(t *testing.T) {
	r := Rules{S: memStore{}}
	if _, err := r.IssueCredential(TestOrg1MSP, "CRED-1", "STU-1", h1); err != nil {
		t.Fatal(err)
	}
	if _, err := r.CreateEntitlement(TestOrg2MSP, "ENT-1", "OPP-01", "STU-1", 1000000); !errors.Is(err, ErrForbidden) {
		t.Fatalf("Org2 is not the authority, got %v", err)
	}
	if _, err := r.CreateEntitlement(TestOrg1MSP, "ENT-1", "OPP-01", "STU-1", 1000000); err != nil {
		t.Fatal(err)
	}
	if _, err := r.AttestMilestone(TestOrg1MSP, "ENT-1"); err != nil {
		t.Fatal(err)
	}
	e, err := r.AttestMilestone(TestOrg2MSP, "ENT-1")
	if err != nil || e.Status != StatusReleased {
		t.Fatalf("Org1 + Org2 should release: %v %v", e, err)
	}
}
