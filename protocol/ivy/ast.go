package ivy

import (
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
)

type contract struct {
	name    string
	params  []*param
	clauses []*clause
	value   string

	// decoration - does the contract call itself?
	// (if so, it has to be quined)
	recursive bool
}

type param struct {
	name string
	typ  typeDesc

	// decoration
	inferredType typeDesc
}

func (p param) bestType() typeDesc {
	if p.inferredType != nilType {
		return p.inferredType
	}
	return p.typ
}

type clause struct {
	name       string
	params     []*param
	statements []statement
	reqs       []*clauseRequirement

	// decorations
	mintimes, maxtimes []string
	hashCalls          []hashCall
}

type hashCall struct {
	HashType string `json:"hash_type"`
	Arg      string `json:"arg"`
	ArgType  string `json:"arg_type"`
}

type clauseRequirement struct {
	name                  string
	assetExpr, amountExpr expression
}

type statement interface {
	countVarRefs(map[string]int)
}

type verifyStatement struct {
	expr expression
}

func (s verifyStatement) countVarRefs(counts map[string]int) {
	s.expr.countVarRefs(counts)
}

type lockStatement struct {
	locked  expression
	program expression

	// Added as a decoration, used by CHECKOUTPUT
	index int64
}

func (s lockStatement) countVarRefs(counts map[string]int) {
	s.locked.countVarRefs(counts)
	s.program.countVarRefs(counts)
}

type unlockStatement struct {
	expr expression
}

func (s unlockStatement) countVarRefs(counts map[string]int) {
	s.expr.countVarRefs(counts)
}

type expression interface {
	String() string
	typ(*environ) typeDesc
	countVarRefs(map[string]int)
}

type binaryExpr struct {
	left, right expression
	op          *binaryOp
}

func (e binaryExpr) String() string {
	return fmt.Sprintf("(%s %s %s)", e.left, e.op.op, e.right)
}

func (e binaryExpr) typ(*environ) typeDesc {
	return e.op.result
}

func (e binaryExpr) countVarRefs(counts map[string]int) {
	e.left.countVarRefs(counts)
	e.right.countVarRefs(counts)
}

type unaryExpr struct {
	op   *unaryOp
	expr expression
}

func (e unaryExpr) String() string {
	return fmt.Sprintf("%s%s", e.op.op, e.expr)
}

func (e unaryExpr) typ(*environ) typeDesc {
	return e.op.result
}

func (e unaryExpr) countVarRefs(counts map[string]int) {
	e.expr.countVarRefs(counts)
}

type call struct {
	fn   expression
	args []expression
}

func (e call) String() string {
	var argStrs []string
	for _, a := range e.args {
		argStrs = append(argStrs, a.String())
	}
	return fmt.Sprintf("%s(%s)", e.fn, strings.Join(argStrs, ", "))
}

func (e call) typ(env *environ) typeDesc {
	if b := referencedBuiltin(e.fn); b != nil {
		switch b.name {
		case "sha3":
			if len(e.args) == 1 {
				switch e.args[0].typ(env) {
				case strType:
					return sha3StrType
				case pubkeyType:
					return sha3PubkeyType
				}
			}

		case "sha256":
			if len(e.args) == 1 {
				switch e.args[0].typ(env) {
				case strType:
					return sha256StrType
				case pubkeyType:
					return sha256PubkeyType
				}
			}
		}

		return b.result
	}
	if e.fn.typ(env) == predType {
		return boolType
	}
	if e.fn.typ(env) == contractType {
		return progType
	}
	return nilType
}

func (e call) countVarRefs(counts map[string]int) {
	e.fn.countVarRefs(counts)
	for _, a := range e.args {
		a.countVarRefs(counts)
	}
}

type varRef string

func (v varRef) String() string {
	return string(v)
}

func (e varRef) typ(env *environ) typeDesc {
	if entry := env.lookup(string(e)); entry != nil {
		return entry.t
	}
	return nilType
}

func (e varRef) countVarRefs(counts map[string]int) {
	counts[string(e)]++
}

type bytesLiteral []byte

func (e bytesLiteral) String() string {
	return "0x" + hex.EncodeToString([]byte(e))
}

func (bytesLiteral) typ(*environ) typeDesc {
	return "String"
}

func (bytesLiteral) countVarRefs(map[string]int) {}

type integerLiteral int64

func (e integerLiteral) String() string {
	return strconv.FormatInt(int64(e), 10)
}

func (integerLiteral) typ(*environ) typeDesc {
	return "Integer"
}

func (integerLiteral) countVarRefs(map[string]int) {}

type booleanLiteral bool

func (e booleanLiteral) String() string {
	if e {
		return "true"
	}
	return "false"
}

func (booleanLiteral) typ(*environ) typeDesc {
	return "Boolean"
}

func (booleanLiteral) countVarRefs(map[string]int) {}

type listExpr []expression

func (e listExpr) String() string {
	var elts []string
	for _, elt := range e {
		elts = append(elts, elt.String())
	}
	return fmt.Sprintf("[%s]", strings.Join(elts, ", "))
}

func (listExpr) typ(*environ) typeDesc {
	return "List"
}

func (e listExpr) countVarRefs(counts map[string]int) {
	for _, elt := range e {
		elt.countVarRefs(counts)
	}
}
