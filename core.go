// Package core holds Dhaari's on-chain business rules with no framework dependency.
// The Fabric/DRUNIX adapter in cmd/chaincode maps contract calls onto these functions,
// passing the caller's MSP ID (organisation identity) and the ledger state store.
package core

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
)

// Store is the slice of the chaincode stub that the rules need (GetState/PutState).
type Store interface {
	Get(key string) ([]byte, error)
	Put(key string, value []byte) error
}

// Organisation MSP IDs on the Dhaari network.
const (
	SchoolMSP    = "SchoolMSP"
	TrainingMSP  = "TrainingMSP"
	EmployerMSP  = "EmployerMSP"
	AuthorityMSP = "AuthorityMSP"
	BankMSP      = "BankMSP"
)

// DRUNIX's bundled test network has two organisations. For demos on it,
// Org1 acts as the school and the scholarship authority, Org2 as the training partner.
const (
	TestOrg1MSP = "Org1MSP"
	TestOrg2MSP = "Org2MSP"
)

var (
	issuers     = map[string]bool{SchoolMSP: true, TrainingMSP: true, TestOrg1MSP: true, TestOrg2MSP: true}
	attesters   = map[string]bool{SchoolMSP: true, TrainingMSP: true, EmployerMSP: true, TestOrg1MSP: true, TestOrg2MSP: true}
	authorities = map[string]bool{AuthorityMSP: true, TestOrg1MSP: true}
	hashRe      = regexp.MustCompile(`^[0-9a-f]{64}$`)
	idRe        = regexp.MustCompile(`^[A-Z0-9-]{3,40}$`)
)

var (
	ErrForbidden = errors.New("forbidden")
	ErrExists    = errors.New("already exists")
	ErrNotFound  = errors.New("not found")
	ErrInvalid   = errors.New("invalid input")
)

// Credential: only a hash of the document and a pseudonymous student reference go on-chain.
type Credential struct {
	ID          string `json:"id"`
	StudentRef  string `json:"studentRef"`
	PayloadHash string `json:"payloadHash"`
	IssuerMSP   string `json:"issuerMsp"`
	Revoked     bool   `json:"revoked"`
}

type Entitlement struct {
	ID           string   `json:"id"`
	SchemeID     string   `json:"schemeId"`
	StudentRef   string   `json:"studentRef"`
	AmountPaise  int64    `json:"amountPaise"`
	Attestations []string `json:"attestations"`
	Status       string   `json:"status"`
}

const (
	StatusCreated  = "CREATED"
	StatusPending  = "AWAITING_SECOND_ATTESTATION"
	StatusReleased = "RELEASE_APPROVED"
)

type Rules struct{ S Store }

func (r Rules) get(key string, v any) (bool, error) {
	b, err := r.S.Get(key)
	if err != nil {
		return false, err
	}
	if b == nil {
		return false, nil
	}
	return true, json.Unmarshal(b, v)
}

func (r Rules) put(key string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return r.S.Put(key, b)
}

func checkIDs(ids ...string) error {
	for _, id := range ids {
		if !idRe.MatchString(id) {
			return fmt.Errorf("%w: id %q must be 3-40 characters of A-Z, 0-9 or -", ErrInvalid, id)
		}
	}
	return nil
}

// IssueCredential: only schools and training partners may issue.
func (r Rules) IssueCredential(callerMSP, id, studentRef, payloadHash string) (*Credential, error) {
	if !issuers[callerMSP] {
		return nil, fmt.Errorf("%w: %s cannot issue credentials", ErrForbidden, callerMSP)
	}
	if err := checkIDs(id, studentRef); err != nil {
		return nil, err
	}
	if !hashRe.MatchString(payloadHash) {
		return nil, fmt.Errorf("%w: payload hash must be 64 lowercase hex characters", ErrInvalid)
	}
	var existing Credential
	if ok, err := r.get("cred:"+id, &existing); err != nil {
		return nil, err
	} else if ok {
		return nil, fmt.Errorf("%w: credential %s", ErrExists, id)
	}
	c := &Credential{ID: id, StudentRef: studentRef, PayloadHash: payloadHash, IssuerMSP: callerMSP}
	return c, r.put("cred:"+id, c)
}

// VerifyCredential recomputation happens off-chain; the chain confirms the hash matches and is not revoked.
func (r Rules) VerifyCredential(id, payloadHash string) (bool, string, error) {
	var c Credential
	ok, err := r.get("cred:"+id, &c)
	if err != nil {
		return false, "", err
	}
	switch {
	case !ok:
		return false, "credential not found", nil
	case c.Revoked:
		return false, "credential revoked by issuer", nil
	case c.PayloadHash != payloadHash:
		return false, "document does not match the sealed hash", nil
	}
	return true, "valid", nil
}

// RevokeCredential: only the original issuer may revoke.
func (r Rules) RevokeCredential(callerMSP, id string) error {
	var c Credential
	ok, err := r.get("cred:"+id, &c)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("%w: credential %s", ErrNotFound, id)
	}
	if c.IssuerMSP != callerMSP {
		return fmt.Errorf("%w: only %s can revoke %s", ErrForbidden, c.IssuerMSP, id)
	}
	c.Revoked = true
	return r.put("cred:"+id, &c)
}

// CreateEntitlement: issued by the scholarship authority, at most once per student per scheme.
// The eligibility decision itself is made by the deterministic rules engine before this call.
func (r Rules) CreateEntitlement(callerMSP, id, schemeID, studentRef string, amountPaise int64) (*Entitlement, error) {
	if !authorities[callerMSP] {
		return nil, fmt.Errorf("%w: %s cannot create entitlements", ErrForbidden, callerMSP)
	}
	if err := checkIDs(id, schemeID, studentRef); err != nil {
		return nil, err
	}
	if amountPaise <= 0 {
		return nil, fmt.Errorf("%w: amount must be positive", ErrInvalid)
	}
	idx := "entidx:" + schemeID + ":" + studentRef
	var prior string
	if ok, err := r.get(idx, &prior); err != nil {
		return nil, err
	} else if ok {
		return nil, fmt.Errorf("%w: student already holds entitlement %s for scheme %s", ErrExists, prior, schemeID)
	}
	var e0 Entitlement
	if ok, err := r.get("ent:"+id, &e0); err != nil {
		return nil, err
	} else if ok {
		return nil, fmt.Errorf("%w: entitlement %s", ErrExists, id)
	}
	e := &Entitlement{ID: id, SchemeID: schemeID, StudentRef: studentRef, AmountPaise: amountPaise, Attestations: []string{}, Status: StatusCreated}
	if err := r.put("ent:"+id, e); err != nil {
		return nil, err
	}
	return e, r.put(idx, id)
}

// AttestMilestone: two different attesting organisations must confirm before release.
func (r Rules) AttestMilestone(callerMSP, entitlementID string) (*Entitlement, error) {
	if !attesters[callerMSP] {
		return nil, fmt.Errorf("%w: %s cannot attest milestones", ErrForbidden, callerMSP)
	}
	var e Entitlement
	ok, err := r.get("ent:"+entitlementID, &e)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("%w: entitlement %s", ErrNotFound, entitlementID)
	}
	if e.Status == StatusReleased {
		return nil, fmt.Errorf("%w: entitlement %s is already released", ErrExists, entitlementID)
	}
	for _, m := range e.Attestations {
		if m == callerMSP {
			return nil, fmt.Errorf("%w: %s has already attested; a different organisation must confirm", ErrExists, callerMSP)
		}
	}
	e.Attestations = append(e.Attestations, callerMSP)
	if len(e.Attestations) >= 2 {
		e.Status = StatusReleased
	} else {
		e.Status = StatusPending
	}
	return &e, r.put("ent:"+entitlementID, &e)
}

// GetEntitlement returns the current state of an entitlement.
func (r Rules) GetEntitlement(id string) (*Entitlement, error) {
	var e Entitlement
	ok, err := r.get("ent:"+id, &e)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("%w: entitlement %s", ErrNotFound, id)
	}
	return &e, nil
}
