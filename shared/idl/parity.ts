/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/parity.json`.
 */
export type Parity = {
  "address": "55jabap7VG6LKKJtidxVRBuLaLzFz6P96uPUicR2e4EQ",
  "metadata": {
    "name": "parity",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addMargin",
      "docs": [
        "Owner of `side` tops up that side's margin (status is re-evaluated by the next mark)."
      ],
      "discriminator": [
        211,
        238,
        238,
        90,
        223,
        228,
        228,
        76
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.offer",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "position.index",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "position"
          ]
        },
        {
          "name": "ownerToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelOffer",
      "docs": [
        "Maker deactivates an offer; its locked margin returns to the maker's canonical ATA."
      ],
      "discriminator": [
        92,
        203,
        223,
        40,
        92,
        89,
        53,
        119
      ],
      "accounts": [
        {
          "name": "maker",
          "signer": true,
          "relations": [
            "offer"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "offer.maker",
                "account": "makerOffer"
              },
              {
                "kind": "account",
                "path": "offer.nonce",
                "account": "makerOffer"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "offer"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "makerAta",
          "docs": [
            "Payout goes only to the maker's canonical ATA for the offer's mint."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "offer.maker",
                "account": "makerOffer"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": []
    },
    {
      "name": "createOffer",
      "docs": [
        "Maker posts an offer and locks IM plus the protocol's spread share on full capacity."
      ],
      "discriminator": [
        237,
        233,
        192,
        168,
        248,
        7,
        249,
        241
      ],
      "accounts": [
        {
          "name": "maker",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "makerAta",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "marketId",
          "type": "u16"
        },
        {
          "name": "makerSide",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "spreadBps",
          "type": "u16"
        },
        {
          "name": "minTenorDays",
          "type": "u16"
        },
        {
          "name": "maxTenorDays",
          "type": "u16"
        },
        {
          "name": "capacityUsd",
          "type": "u64"
        }
      ]
    },
    {
      "name": "debugPrice",
      "docs": [
        "Permissionless view: read a market price (demo override or Pyth) and emit `PriceRead`."
      ],
      "discriminator": [
        161,
        175,
        169,
        88,
        33,
        184,
        153,
        59
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "demoState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  109,
                  111
                ]
              }
            ]
          }
        },
        {
          "name": "priceA"
        },
        {
          "name": "priceB"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": "u16"
        }
      ]
    },
    {
      "name": "fundInsurance",
      "discriminator": [
        58,
        216,
        37,
        162,
        201,
        50,
        20,
        66
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "mint"
        },
        {
          "name": "adminToken",
          "writable": true
        },
        {
          "name": "insurance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  115,
                  117,
                  114,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initCollateral",
      "discriminator": [
        115,
        16,
        62,
        141,
        118,
        245,
        226,
        21
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "insurance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  115,
                  117,
                  114,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Must be the program's upgrade authority (prevents first-caller-wins initialization)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "program",
          "address": "55jabap7VG6LKKJtidxVRBuLaLzFz6P96uPUicR2e4EQ"
        },
        {
          "name": "programData"
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "demoState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  109,
                  111
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "usdgMint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "riskParams"
            }
          }
        }
      ]
    },
    {
      "name": "liquidate",
      "docs": [
        "Any signer liquidates a confirmed, still-breaching position: partial first, full if the",
        "reduced position is still below the threshold (or it was already partially liquidated).",
        "The caller's reward goes to `caller_ata`; payouts go to the long/short canonical ATAs."
      ],
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.offer",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "position.index",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "position.marketId",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "rateBase",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market.base",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "rateQuote",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market.quote",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "demoState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  109,
                  111
                ]
              }
            ]
          }
        },
        {
          "name": "priceA"
        },
        {
          "name": "priceB"
        },
        {
          "name": "mint",
          "relations": [
            "position"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "insurance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  115,
                  117,
                  114,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "callerAta",
          "docs": [
            "Receives the liquidator reward."
          ],
          "writable": true
        },
        {
          "name": "longAta",
          "docs": [
            "Any token account of `mint` owned by `position.long` (receives the long side's payout)."
          ],
          "writable": true
        },
        {
          "name": "shortAta",
          "docs": [
            "Any token account of `mint` owned by `position.short` (receives the short side's payout)."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "mark",
      "docs": [
        "Permissionless mark-to-market: fresh price required; updates status and breach count."
      ],
      "discriminator": [
        203,
        149,
        171,
        234,
        35,
        230,
        238,
        184
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.offer",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "position.index",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "position.marketId",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "rateBase",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market.base",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "rateQuote",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market.quote",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "demoState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  109,
                  111
                ]
              }
            ]
          }
        },
        {
          "name": "priceA"
        },
        {
          "name": "priceB"
        }
      ],
      "args": []
    },
    {
      "name": "setDemoClock",
      "discriminator": [
        47,
        86,
        158,
        47,
        167,
        18,
        42,
        239
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "offsetSecs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setDemoMode",
      "discriminator": [
        190,
        208,
        120,
        39,
        35,
        234,
        145,
        104
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "demoState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  109,
                  111
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "on",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setDemoPrice",
      "discriminator": [
        9,
        174,
        93,
        13,
        189,
        204,
        41,
        119
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "demoState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  109,
                  111
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": "u16"
        },
        {
          "name": "a",
          "type": "u64"
        },
        {
          "name": "b",
          "type": "u64"
        },
        {
          "name": "set",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setParams",
      "discriminator": [
        27,
        234,
        178,
        52,
        147,
        2,
        187,
        141
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "riskParams"
            }
          }
        }
      ]
    },
    {
      "name": "setRate",
      "discriminator": [
        99,
        58,
        170,
        238,
        160,
        120,
        74,
        11
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "rate",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "code"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "code",
          "type": {
            "array": [
              "u8",
              3
            ]
          }
        },
        {
          "name": "rateBps",
          "type": "i64"
        },
        {
          "name": "basisDays",
          "type": "u16"
        }
      ]
    },
    {
      "name": "settle",
      "docs": [
        "Permissionless settlement at or after maturity at spot (τ = 0) through the loss waterfall."
      ],
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.offer",
                "account": "position"
              },
              {
                "kind": "account",
                "path": "position.index",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "position.marketId",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "rateBase",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market.base",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "rateQuote",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market.quote",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "demoState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  109,
                  111
                ]
              }
            ]
          }
        },
        {
          "name": "priceA"
        },
        {
          "name": "priceB"
        },
        {
          "name": "mint",
          "relations": [
            "position"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "insurance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  115,
                  117,
                  114,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "longAta",
          "docs": [
            "Any token account of `mint` owned by `position.long` (receives the long side's payout)."
          ],
          "writable": true
        },
        {
          "name": "shortAta",
          "docs": [
            "Any token account of `mint` owned by `position.short` (receives the short side's payout)."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "takeOffer",
      "docs": [
        "Taker opens a margined forward position against an offer (one PDA per offer counter)."
      ],
      "discriminator": [
        128,
        156,
        242,
        207,
        237,
        192,
        103,
        240
      ],
      "accounts": [
        {
          "name": "taker",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "offer.maker",
                "account": "makerOffer"
              },
              {
                "kind": "account",
                "path": "offer.nonce",
                "account": "makerOffer"
              }
            ]
          }
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "demoState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  109,
                  111
                ]
              }
            ]
          }
        },
        {
          "name": "rateBase",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market.base",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "rateQuote",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market.quote",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "position",
          "docs": [
            "Indexed by the offer's position counter before this take."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              },
              {
                "kind": "account",
                "path": "offer.positionCounter",
                "account": "makerOffer"
              }
            ]
          }
        },
        {
          "name": "priceA"
        },
        {
          "name": "priceB"
        },
        {
          "name": "mint",
          "relations": [
            "offer"
          ]
        },
        {
          "name": "takerAta",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "insurance",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  115,
                  117,
                  114,
                  97,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "notionalUsd",
          "type": "u64"
        },
        {
          "name": "tenorDays",
          "type": "u16"
        }
      ]
    },
    {
      "name": "upsertMarket",
      "discriminator": [
        73,
        122,
        217,
        17,
        70,
        77,
        57,
        39
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "args.id"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "marketArgs"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "demoState",
      "discriminator": [
        11,
        185,
        58,
        156,
        242,
        142,
        174,
        117
      ]
    },
    {
      "name": "makerOffer",
      "discriminator": [
        205,
        242,
        213,
        240,
        28,
        220,
        42,
        136
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    },
    {
      "name": "rate",
      "discriminator": [
        171,
        48,
        95,
        14,
        112,
        112,
        23,
        79
      ]
    }
  ],
  "events": [
    {
      "name": "liquidated",
      "discriminator": [
        231,
        57,
        55,
        75,
        0,
        170,
        246,
        68
      ]
    },
    {
      "name": "marginAdded",
      "discriminator": [
        121,
        187,
        28,
        95,
        195,
        171,
        37,
        8
      ]
    },
    {
      "name": "marked",
      "discriminator": [
        19,
        64,
        116,
        147,
        208,
        214,
        180,
        172
      ]
    },
    {
      "name": "offerCancelled",
      "discriminator": [
        45,
        42,
        175,
        214,
        51,
        192,
        154,
        9
      ]
    },
    {
      "name": "offerCreated",
      "discriminator": [
        31,
        236,
        215,
        144,
        75,
        45,
        157,
        87
      ]
    },
    {
      "name": "partiallyLiquidated",
      "discriminator": [
        124,
        196,
        227,
        220,
        182,
        174,
        171,
        126
      ]
    },
    {
      "name": "positionOpened",
      "discriminator": [
        237,
        175,
        243,
        230,
        147,
        117,
        101,
        121
      ]
    },
    {
      "name": "priceRead",
      "discriminator": [
        157,
        114,
        25,
        242,
        1,
        216,
        49,
        119
      ]
    },
    {
      "name": "settled",
      "discriminator": [
        232,
        210,
        40,
        17,
        142,
        124,
        145,
        238
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not the config admin"
    },
    {
      "code": 6001,
      "name": "demoModeOff",
      "msg": "Demo mode is off"
    },
    {
      "code": 6002,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6003,
      "name": "invalidMarket",
      "msg": "Invalid market"
    },
    {
      "code": 6004,
      "name": "marketInactive",
      "msg": "Market is inactive"
    },
    {
      "code": 6005,
      "name": "invalidMint",
      "msg": "Mint is not an allowed collateral mint"
    },
    {
      "code": 6006,
      "name": "wrongFeed",
      "msg": "Price account feed id or verification level mismatch"
    },
    {
      "code": 6007,
      "name": "notPythAccount",
      "msg": "Account is not a Pyth price update"
    },
    {
      "code": 6008,
      "name": "marketClosedOrStale",
      "msg": "Market closed or price stale"
    },
    {
      "code": 6009,
      "name": "oracleConfidence",
      "msg": "Oracle confidence interval too wide"
    },
    {
      "code": 6010,
      "name": "stalePublishTime",
      "msg": "Price publish time not newer than last mark"
    },
    {
      "code": 6011,
      "name": "invalidTenor",
      "msg": "Invalid tenor"
    },
    {
      "code": 6012,
      "name": "belowMinNotional",
      "msg": "Notional below minimum"
    },
    {
      "code": 6013,
      "name": "insufficientCapacity",
      "msg": "Insufficient offer capacity"
    },
    {
      "code": 6014,
      "name": "offerInactive",
      "msg": "Offer is inactive"
    },
    {
      "code": 6015,
      "name": "notLiquidatable",
      "msg": "Position is not liquidatable"
    },
    {
      "code": 6016,
      "name": "notConfirmed",
      "msg": "Liquidation not confirmed by enough marks"
    },
    {
      "code": 6017,
      "name": "notMatured",
      "msg": "Position has not matured"
    },
    {
      "code": 6018,
      "name": "positionClosed",
      "msg": "Position is closed"
    },
    {
      "code": 6019,
      "name": "invalidParams",
      "msg": "Invalid parameters"
    },
    {
      "code": 6020,
      "name": "marginTooLow",
      "msg": "Margin too low"
    },
    {
      "code": 6021,
      "name": "payoutAccountUnsupported",
      "msg": "Payout token account has RequiredMemoTransfers or CpiGuard enabled"
    }
  ],
  "types": [
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "usdgMint",
            "type": "pubkey"
          },
          {
            "name": "demoMode",
            "type": "bool"
          },
          {
            "name": "demoClockOffset",
            "type": "i64"
          },
          {
            "name": "params",
            "type": {
              "defined": {
                "name": "riskParams"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "demoPrice",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "a",
            "type": "u64"
          },
          {
            "name": "b",
            "type": "u64"
          },
          {
            "name": "set",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "demoState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "prices",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "demoPrice"
                  }
                },
                16
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "liquidated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "pnlLong",
            "docs": [
              "Long PnL of the (remaining) position at the liquidation price."
            ],
            "type": "i128"
          },
          {
            "name": "fromLoser",
            "type": "u64"
          },
          {
            "name": "fromInsurance",
            "type": "u64"
          },
          {
            "name": "shortfall",
            "type": "u64"
          },
          {
            "name": "penalty",
            "type": "u64"
          },
          {
            "name": "reward",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "makerOffer",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "marketId",
            "type": "u16"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "makerSide",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "spreadBps",
            "type": "u16"
          },
          {
            "name": "minTenorDays",
            "type": "u16"
          },
          {
            "name": "maxTenorDays",
            "type": "u16"
          },
          {
            "name": "capacityUsd",
            "type": "u64"
          },
          {
            "name": "marginLocked",
            "type": "u64"
          },
          {
            "name": "positionCounter",
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marginAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "margin",
            "docs": [
              "The side's margin after the top-up."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "marked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "pnlLong",
            "type": "i128"
          },
          {
            "name": "loserEquity",
            "type": "i128"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "status"
              }
            }
          },
          {
            "name": "breachCount",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u16"
          },
          {
            "name": "symbol",
            "type": {
              "array": [
                "u8",
                12
              ]
            }
          },
          {
            "name": "base",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          },
          {
            "name": "quote",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          },
          {
            "name": "feedA",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "feedB",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "op",
            "type": "u8"
          },
          {
            "name": "scaleNum",
            "type": "u64"
          },
          {
            "name": "scaleDen",
            "type": "u64"
          },
          {
            "name": "quoteConv",
            "type": "u8"
          },
          {
            "name": "imBps",
            "type": "u16"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketArgs",
      "docs": [
        "Arguments for `upsert_market` (mirrors `Market` minus the bump)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u16"
          },
          {
            "name": "symbol",
            "type": {
              "array": [
                "u8",
                12
              ]
            }
          },
          {
            "name": "base",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          },
          {
            "name": "quote",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          },
          {
            "name": "feedA",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "feedB",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "op",
            "type": "u8"
          },
          {
            "name": "scaleNum",
            "type": "u64"
          },
          {
            "name": "scaleDen",
            "type": "u64"
          },
          {
            "name": "quoteConv",
            "type": "u8"
          },
          {
            "name": "imBps",
            "type": "u16"
          },
          {
            "name": "active",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "offerCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "refunded",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "offerCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "u16"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "makerSide",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "spreadBps",
            "type": "u16"
          },
          {
            "name": "capacityUsd",
            "type": "u64"
          },
          {
            "name": "marginLocked",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "partiallyLiquidated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "realized",
            "docs": [
              "PnL realised on the closed fraction (owed by the loser)."
            ],
            "type": "u64"
          },
          {
            "name": "fromInsurance",
            "type": "u64"
          },
          {
            "name": "shortfall",
            "type": "u64"
          },
          {
            "name": "penalty",
            "type": "u64"
          },
          {
            "name": "reward",
            "type": "u64"
          },
          {
            "name": "remainingQty",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "long",
            "type": "pubkey"
          },
          {
            "name": "short",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "u16"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "notionalUsd",
            "type": "u64"
          },
          {
            "name": "qty",
            "type": "u64"
          },
          {
            "name": "strike",
            "type": "u64"
          },
          {
            "name": "openedAt",
            "type": "i64"
          },
          {
            "name": "maturity",
            "type": "i64"
          },
          {
            "name": "imPerSide",
            "type": "u64"
          },
          {
            "name": "marginLong",
            "type": "u64"
          },
          {
            "name": "marginShort",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "status"
              }
            }
          },
          {
            "name": "breachCount",
            "type": "u8"
          },
          {
            "name": "lastBreachTime",
            "type": "i64"
          },
          {
            "name": "lastPublishTime",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "positionOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "marketId",
            "type": "u16"
          },
          {
            "name": "long",
            "type": "pubkey"
          },
          {
            "name": "short",
            "type": "pubkey"
          },
          {
            "name": "notionalUsd",
            "type": "u64"
          },
          {
            "name": "qty",
            "type": "u64"
          },
          {
            "name": "strike",
            "type": "u64"
          },
          {
            "name": "maturity",
            "type": "i64"
          },
          {
            "name": "mint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "priceRead",
      "docs": [
        "Event form of `crate::oracle::PriceRead`, tagged with the market id."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": "u16"
          },
          {
            "name": "a",
            "type": "u64"
          },
          {
            "name": "b",
            "type": "u64"
          },
          {
            "name": "spot",
            "type": "u64"
          },
          {
            "name": "upq",
            "type": "u64"
          },
          {
            "name": "publishTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "rate",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "code",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          },
          {
            "name": "rateBps",
            "type": "i64"
          },
          {
            "name": "basisDays",
            "type": "u16"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "riskParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "openFeeBps",
            "type": "u16"
          },
          {
            "name": "makerFeeShareBps",
            "type": "u16"
          },
          {
            "name": "liqPenaltyBps",
            "type": "u16"
          },
          {
            "name": "liquidatorRewardBps",
            "type": "u16"
          },
          {
            "name": "partialLiqBps",
            "type": "u16"
          },
          {
            "name": "callEquityBps",
            "type": "u16"
          },
          {
            "name": "liqEquityBps",
            "type": "u16"
          },
          {
            "name": "liqConfirmMarks",
            "type": "u8"
          },
          {
            "name": "liqConfirmMinGapSecs",
            "type": "i64"
          },
          {
            "name": "maxPriceAgeSecs",
            "type": "i64"
          },
          {
            "name": "maxConfBps",
            "type": "u16"
          },
          {
            "name": "minNotional",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "settled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "pnlLong",
            "type": "i128"
          },
          {
            "name": "fromLoser",
            "type": "u64"
          },
          {
            "name": "fromInsurance",
            "type": "u64"
          },
          {
            "name": "shortfall",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "long"
          },
          {
            "name": "short"
          }
        ]
      }
    },
    {
      "name": "status",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "called"
          },
          {
            "name": "partiallyLiquidated"
          },
          {
            "name": "settled"
          },
          {
            "name": "liquidated"
          }
        ]
      }
    }
  ]
};
