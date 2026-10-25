// DRUNIX / Hyperledger Fabric adapter for Dhaari's chaincode.
// Build on a machine with normal internet access:
//
//	cd chaincode/dhaari/cmd/chaincode && go mod tidy && go build
//
// DRUNIX is backward compatible with Fabric v2.5.x chaincode, so the standard contract API is used.
package main

import (
	"log"

	"github.com/dhaari/chaincode/core"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

// stubStore adapts the Fabric stub to core.Store.
type stubStore struct {
	ctx contractapi.TransactionContextInterface
}

func (s stubStore) Get(k string) ([]byte, error) { return s.ctx.GetStub().GetState(k) }
func (s stubStore) Put(k string, v []byte) error { return s.ctx.GetStub().PutState(k, v) }

func rules(ctx contractapi.TransactionContextInterface) core.Rules {
	return core.Rules{S: stubStore{ctx}}
}

// caller returns the organisation (MSP ID) of the submitting identity, taken from its certificate.
func caller(ctx contractapi.TransactionContextInterface) (string, error) {
	return ctx.GetClientIdentity().GetMSPID()
}

type DhaariContract struct{ contractapi.Contract }

func (c *DhaariContract) IssueCredential(ctx contractapi.TransactionContextInterface, id, studentRef, payloadHash string) (*core.Credential, error) {
	msp, err := caller(ctx)
	if err != nil {
		return nil, err
	}
	return rules(ctx).IssueCredential(msp, id, studentRef, payloadHash)
}

func (c *DhaariContract) VerifyCredential(ctx contractapi.TransactionContextInterface, id, payloadHash string) (string, error) {
	ok, reason, err := rules(ctx).VerifyCredential(id, payloadHash)
	if err != nil {
		return "", err
	}
	if ok {
		return "VALID", nil
	}
	return "INVALID: " + reason, nil
}

func (c *DhaariContract) RevokeCredential(ctx contractapi.TransactionContextInterface, id string) error {
	msp, err := caller(ctx)
	if err != nil {
		return err
	}
	return rules(ctx).RevokeCredential(msp, id)
}

func (c *DhaariContract) CreateEntitlement(ctx contractapi.TransactionContextInterface, id, schemeID, studentRef string, amountPaise int64) (*core.Entitlement, error) {
	msp, err := caller(ctx)
	if err != nil {
		return nil, err
	}
	return rules(ctx).CreateEntitlement(msp, id, schemeID, studentRef, amountPaise)
}

func (c *DhaariContract) AttestMilestone(ctx contractapi.TransactionContextInterface, entitlementID string) (*core.Entitlement, error) {
	msp, err := caller(ctx)
	if err != nil {
		return nil, err
	}
	return rules(ctx).AttestMilestone(msp, entitlementID)
}

func (c *DhaariContract) GetEntitlement(ctx contractapi.TransactionContextInterface, id string) (*core.Entitlement, error) {
	return rules(ctx).GetEntitlement(id)
}

func main() {
	cc, err := contractapi.NewChaincode(&DhaariContract{})
	if err != nil {
		log.Fatalf("create chaincode: %v", err)
	}
	if err := cc.Start(); err != nil {
		log.Fatalf("start chaincode: %v", err)
	}
}
