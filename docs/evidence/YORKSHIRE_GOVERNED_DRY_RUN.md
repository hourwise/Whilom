# Yorkshire DATA-R5 Governed Dry-Run Activation Plan

This is a deterministic offline transformation of the sealed Yorkshire activation inputs plus DATA-R4 policy batch `DATA-R4-YORKSHIRE-ACTIVATION-POLICY-7BFEEA47`. It does not execute SQL, connect to Supabase, or authorize activation.

## Evidence and provenance

- Source checkpoint: `3e6552f893b897cc5f82e3d0e9c6982f39419fc0`
- DATA-R4 policy JSON SHA-256: `008CB154DBA9C065D1AB6E1F9F6DBF500F0B52302F310377AB488BFCEC16B364`
- DATA-R4 policy Markdown SHA-256: `63F4BE521B68B6E55FE763A9C64B7242D27AB3E8A73782FB3273E0657CF305F7`
- Derived plan SHA-256: `54501A692D8B101BF8D63138BB9D756DBA865FA71CAA3CC3109C07626E26907F`
- The sealed candidates CSV remains the canonical payload; the derived plan references it by sealed hash and does not duplicate its normalized JSON payload.
- External evidence used: no.
- Hosted activation performed: no.

## Derived counts

| Category                           | Count |
| ---------------------------------- | ----: |
| Source rows                        | 23315 |
| Valid candidate rows               | 23314 |
| Original AUTO_SAFE carried forward | 23171 |
| Governed publishable rows          |   126 |
| Governed deferred rows             |    17 |
| Governed excluded rows             |     0 |
| Publishable rows                   | 23297 |
| New canonical creations            | 23272 |
| Existing canonical merges          |    25 |

The invariants are `23,314 = 23,297 + 17 + 0`, `23,297 = 23,272 + 25`, and `143 = 126 + 17 + 0`.

## AUTO_SAFE stability

All 23171 original AUTO_SAFE rows were carried forward without policy override. The before/after semantic fingerprint is identical; existing-canonical merge targets remain 25.

## DATA-R4 review transitions

| Ordinal | Candidate                            | DATA-R2                     | DATA-R3                                             | Governed action           | Result          | Match target | Publishable |
| ------: | ------------------------------------ | --------------------------- | --------------------------------------------------- | ------------------------- | --------------- | ------------ | ----------: |
|   21041 | b019fb60-0000-4000-8000-000001002985 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21053 | 4628675b-0000-4000-8000-000001003148 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21068 | 22c646c3-0000-4000-8000-000001003681 | DEFER_INSUFFICIENT_EVIDENCE | DEFER_INSUFFICIENT_EVIDENCE                         | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   21076 | 8a982cea-0000-4000-8000-000001003689 | DEFER_INSUFFICIENT_EVIDENCE | DEFER_INSUFFICIENT_EVIDENCE                         | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   21077 | c20ddf03-0000-4000-8000-000001003690 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21163 | 0ef87b81-0000-4000-8000-000001004178 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21166 | e062a71e-0000-4000-8000-000001004181 | DEFER_INSUFFICIENT_EVIDENCE | DEFER_INSUFFICIENT_EVIDENCE                         | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   21182 | 0fc9be63-0000-4000-8000-000001004881 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21198 | 63dd7973-0000-4000-8000-000001004899 | DEFER_INSUFFICIENT_EVIDENCE | DEFER_INSUFFICIENT_EVIDENCE                         | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   21200 | 22378b93-0000-4000-8000-000001004901 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21203 | 092641d9-0000-4000-8000-000001004904 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21207 | 3d0f34e1-0000-4000-8000-000001004908 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21215 | 764b46a2-0000-4000-8000-000001004919 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21216 | adc0f8bb-0000-4000-8000-000001004920 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21226 | 96229e15-0000-4000-8000-000001005210 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21233 | b0fa477a-0000-4000-8000-000001005217 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21234 | fdf4843c-0000-4000-8000-000001005218 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21241 | 9d3c1c7a-0000-4000-8000-000001005227 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21254 | 8989ad83-0000-4000-8000-000001005475 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21263 | 394c5c05-0000-4000-8000-000001005783 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21269 | 72886dad-0000-4000-8000-000001005794 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21271 | a67160ca-0000-4000-8000-000001005798 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21374 | 45644022-0000-4000-8000-000001007820 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21381 | 85b9d00a-0000-4000-8000-000001007848 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21398 | 63909892-0000-4000-8000-000001007875 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21399 | ef1a0594-0000-4000-8000-000001007894 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21415 | 8726e45c-0000-4000-8000-000001008016 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21584 | 9a6dc9c6-0000-4000-8000-000001009702 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21609 | dac93ad0-0000-4000-8000-000001009849 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21618 | 8fd34bec-0000-4000-8000-000001009926 | DEFER_INSUFFICIENT_EVIDENCE | DEFER_INSUFFICIENT_EVIDENCE                         | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   21626 | 5ca8ccc2-0000-4000-8000-000001010079 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21630 | c80771f9-0000-4000-8000-000001010084 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21673 | 91574705-0000-4000-8000-000001010548 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21678 | e055d188-0000-4000-8000-000001010627 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21730 | 2b91861d-0000-4000-8000-000001011581 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21751 | 2f5c33a7-0000-4000-8000-000001011669 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21775 | 4a71cb67-0000-4000-8000-000001011744 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21823 | f2dd1108-0000-4000-8000-000001011967 | DEFER_INSUFFICIENT_EVIDENCE | DEFER_INSUFFICIENT_EVIDENCE                         | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   21824 | 8cd18a8b-0000-4000-8000-000001011969 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21852 | 44933000-0000-4000-8000-000001012065 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21865 | aaa494a4-0000-4000-8000-000001012182 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21951 | 3ac417a7-0000-4000-8000-000001012873 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21956 | 5aeedf91-0000-4000-8000-000001012887 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21957 | a7e91c53-0000-4000-8000-000001012888 | REJECT_MATCH                | REJECT_MATCH_DEFER                                  | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   21960 | 79534807-0000-4000-8000-000001012891 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21961 | c64d84c9-0000-4000-8000-000001012892 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21962 | 6041fe4c-0000-4000-8000-000001012894 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21978 | edcfb931-0000-4000-8000-000001012991 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21982 | 21b8ac50-0000-4000-8000-000001012995 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21983 | df3d9065-0000-4000-8000-000001013019 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21986 | bb15e90d-0000-4000-8000-000001013087 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21996 | 2a451993-0000-4000-8000-000001013299 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   21997 | 9ba4ebe3-0000-4000-8000-000001013300 | DEFER_INSUFFICIENT_EVIDENCE | DEFER_INSUFFICIENT_EVIDENCE                         | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   21998 | e89f28a5-0000-4000-8000-000001013301 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22007 | f7107816-0000-4000-8000-000001013403 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22066 | 6b92c7de-0000-4000-8000-000001013622 | DEFER_INSUFFICIENT_EVIDENCE | DEFER_INSUFFICIENT_EVIDENCE                         | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   22146 | 762386b8-0000-4000-8000-000001014004 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22148 | 4ea7307c-0000-4000-8000-000001014024 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22218 | 293509db-0000-4000-8000-000001014241 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22279 | 6ee3970c-0000-4000-8000-000001014395 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22353 | 0b8c6680-0000-4000-8000-000001015308 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22358 | cd031447-0000-4000-8000-000001015409 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22369 | c09c55a5-0000-4000-8000-000001015504 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22371 | 06450426-0000-4000-8000-000001015539 | REJECT_MATCH                | REJECT_MATCH_DEFER                                  | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   22410 | cf1321bd-0000-4000-8000-000001015725 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22424 | 5ca0dca0-0000-4000-8000-000001015822 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22435 | 56bc5f5d-0000-4000-8000-000001016024 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22453 | 28ae23a1-0000-4000-8000-000001016424 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22469 | e1947c11-0000-4000-8000-000001016946 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22532 | 90ba137f-0000-4000-8000-000001017225 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22579 | a9d719cb-0000-4000-8000-000001017460 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22585 | 4ce95f4f-0000-4000-8000-000001017557 | DEFER_INSUFFICIENT_EVIDENCE | DEFER_INSUFFICIENT_EVIDENCE                         | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   22600 | 0e65ee47-0000-4000-8000-000001017777 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22604 | e59936e7-0000-4000-8000-000001017827 | REJECT_MATCH                | REJECT_MATCH_DEFER                                  | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   22625 | 2cb4d488-0000-4000-8000-000001018149 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22646 | 583fa485-0000-4000-8000-000001018404 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22692 | 2b81ca50-0000-4000-8000-000001018774 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22714 | c77a94ca-0000-4000-8000-000001018854 | DEFER_INSUFFICIENT_EVIDENCE | DEFER_INSUFFICIENT_EVIDENCE                         | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   22723 | ae6f292f-0000-4000-8000-000001018976 | REJECT_MATCH                | REJECT_MATCH_DEFER                                  | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   22729 | 66c80b12-0000-4000-8000-000001018982 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22751 | 9c1e0f65-0000-4000-8000-000001019154 | DEFER_INSUFFICIENT_EVIDENCE | DEFER_INSUFFICIENT_EVIDENCE                         | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   22754 | 9e225d25-0000-4000-8000-000001019232 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22832 | d21cee2c-0000-4000-8000-000001019593 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   22939 | 53b9ecd2-0000-4000-8000-000001019825 | DEFER_INSUFFICIENT_EVIDENCE | DEFER_INSUFFICIENT_EVIDENCE                         | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   23006 | 214f7bd6-0000-4000-8000-000001020324 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23027 | 0a428019-0000-4000-8000-000001020405 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23028 | 573cbcdb-0000-4000-8000-000001020406 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23030 | e2c629f5-0000-4000-8000-000001020425 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23056 | e81f26dd-0000-4000-8000-000001020551 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23124 | 0f8bdc98-0000-4000-8000-000001021018 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23127 | 2df044f6-0000-4000-8000-000001021022 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23157 | ddad15b9-0000-4000-8000-000001021211 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23171 | aedf315e-0000-4000-8000-000001021265 | DEFER_INSUFFICIENT_EVIDENCE | DEFER_INSUFFICIENT_EVIDENCE                         | DEFER                     | REVIEW_REQUIRED | —            |          no |
|   23173 | 48d3aae2-0000-4000-8000-000001021267 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23192 | ac287f23-0000-4000-8000-000001417240 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23211 | e5f619cd-0000-4000-8000-000001000130 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23216 | 189a67b4-0000-4000-8000-000001000402 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23217 | 6594a476-0000-4000-8000-000001000403 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23219 | 51d67959-0000-4000-8000-000001000413 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23221 | 72071f59-0000-4000-8000-000001000546 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23222 | 775a3df8-0000-4000-8000-000001000553 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23223 | ea9209d8-0000-4000-8000-000001000921 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23224 | 378c469a-0000-4000-8000-000001000922 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23225 | 8486835c-0000-4000-8000-000001000923 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23227 | 1e7afce0-0000-4000-8000-000001000925 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23228 | ceeb139c-0000-4000-8000-000001001055 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23229 | 1be5505e-0000-4000-8000-000001001056 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23230 | 68df8d37-0000-4000-8000-000001001057 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23231 | 02d406ba-0000-4000-8000-000001001059 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23232 | 3a49b8d3-0000-4000-8000-000001001060 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23233 | 8743f595-0000-4000-8000-000001001061 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23234 | d43e3257-0000-4000-8000-000001001062 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23237 | 5521621f-0000-4000-8000-000001001067 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23238 | a21b9ee1-0000-4000-8000-000001001068 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23239 | ef15dba3-0000-4000-8000-000001001069 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23240 | 268b8dd3-0000-4000-8000-000001001070 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23241 | 7385ca95-0000-4000-8000-000001001071 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23245 | a76ebd9d-0000-4000-8000-000001001075 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23247 | 53d6df1c-0000-4000-8000-000001001216 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23251 | 0c2fc114-0000-4000-8000-000001001222 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23252 | 5929fdd6-0000-4000-8000-000001001223 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23255 | e2b4fb1f-0000-4000-8000-000001001283 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23256 | 154d8cfe-0000-4000-8000-000001001317 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23257 | 795aa3c2-0000-4000-8000-000001001356 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23261 | 760bd2fc-0000-4000-8000-000001001427 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23262 | fc422160-0000-4000-8000-000001001439 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23263 | b9ee21dc-0000-4000-8000-000001001452 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23264 | a62ff6be-0000-4000-8000-000001001462 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23266 | c107a007-0000-4000-8000-000001001469 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23267 | f87d5220-0000-4000-8000-000001001470 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23275 | b14c3280-0000-4000-8000-000001001516 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23276 | 983ae8c4-0000-4000-8000-000001001519 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23277 | cfb09add-0000-4000-8000-000001001520 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23281 | 0e07bb07-0000-4000-8000-000001001589 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23282 | 135ad9a6-0000-4000-8000-000001001596 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23286 | 039f6c03-0000-4000-8000-000001001643 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23287 | 3cdb7da6-0000-4000-8000-000001001654 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23289 | 49481a6e-0000-4000-8000-000001001678 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23291 | 6ec6010a-0000-4000-8000-000001001699 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23294 | f7062dcf-0000-4000-8000-000001404586 | REJECT_MATCH                | REJECT_MATCH_CREATE_CANONICAL                       | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23297 | e6c06d4c-0000-4000-8000-000001441192 | KEEP_SEPARATE_CANONICAL     | —                                                   | CREATE_SEPARATE_CANONICAL | AUTO_SAFE       | —            |         yes |
|   23312 | afd0cd1d-0000-4000-8000-000001000099 | DEFER_INSUFFICIENT_EVIDENCE | EXPECTED_MULTI_CANDIDATE / RETAIN_TWO_GEOMETRY_ROWS | RETAIN_MULTI_GEOMETRY     | AUTO_SAFE       | —            |         yes |
|   23313 | afd0cd1e-0000-4000-8000-000001000099 | DEFER_INSUFFICIENT_EVIDENCE | EXPECTED_MULTI_CANDIDATE / RETAIN_TWO_GEOMETRY_ROWS | RETAIN_MULTI_GEOMETRY     | AUTO_SAFE       | —            |         yes |

## Deferred rows

These rows are present in the governed plan but absent from the publishable activation set:

| Ordinal | Candidate                            | Source record | Reason                                                                                                                                                                                                                                                                                                                                                                |
| ------: | ------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   21068 | 22c646c3-0000-4000-8000-000001003681 | 1003681       | The proposed and source names are identical and the points are 10.3m apart, but the sealed rationale records a near-tie with another candidate. The source is a scheduled monument while the proposed record is a listed building, and the captured artefacts do not preserve enough competing-candidate identity/context to prove which physical bridge is intended. |
|   21076 | 8a982cea-0000-4000-8000-000001003689 | 1003689       | The points are 9.2m apart and both labels describe St Peter's Church, but the source is a scheduled monument and the proposed record is a listed building. No source-specific alternate name or contextual description is captured that proves these are the same designation rather than overlapping records for different church elements.                          |
|   21166 | e062a71e-0000-4000-8000-000001004181 | 1004181       | The points are 3.6m apart, but the names differ between The Abbot's Staithes and Abbots Staith Buildings and the inferred types conflict (archaeological_site versus structure). The captured evidence does not establish whether the entries denote the same remains or adjacent built elements.                                                                     |
|   21198 | 63dd7973-0000-4000-8000-000001004899 | 1004899       | The names are the non-distinctive New Bridge and the points are 2.2m apart. The source is a scheduled monument and the proposed record is a listed building; proximity alone cannot establish identity for a generic bridge name.                                                                                                                                     |
|   21618 | 8fd34bec-0000-4000-8000-000001009926 | 1009926       | The source names a moat at Fairburn Ings/Newton Abbey and the proposed record names the remains of Newton Abbey; the points are 16.6m apart and both infer abbey. The captured evidence does not establish whether the source is the same abbey remains or a separate moat feature within the wider site.                                                             |
|   21823 | f2dd1108-0000-4000-8000-000001011967 | 1011967       | The source explicitly names Lord Dacre’s/Towton Cross and the proposed record contains Lord Dacres Cross; the points are 34.1m apart and both infer monument. The sealed evidence does not preserve enough contextual detail to distinguish a confirmed identity from a nearby cross reference.                                                                       |
|   21957 | a7e91c53-0000-4000-8000-000001012888 | 1012888       | The source is valid, but the same-name Low Cross records are only 7m apart and the place-type conflict could reflect either distinct designations or a mapping difference. No positive evidence safely establishes a separate physical entity or an alternate match.                                                                                                  |
|   21997 | 9ba4ebe3-0000-4000-8000-000001013300 | 1013300       | The source is a cross base in All Saints' churchyard, while the proposed record is Church of All Saints; the points are 16.1m apart and the inferred types differ (monument versus church). The captured evidence supports proximity but not identity of the cross and church records.                                                                                |
|   22066 | 6b92c7de-0000-4000-8000-000001013622 | 1013622       | The names are the generic Village cross/Village Cross and the points are 6.3m apart, with matching monument inference but different source designations. A shared generic label and proximity are insufficient to merge the records safely.                                                                                                                           |
|   22371 | 06450426-0000-4000-8000-000001015539 | 1015539       | The source and proposed candidate occupy the same point and share the Fulford Cross name. The inferred military_installation versus monument conflict is insufficient to prove separation or a wrong source record, so the source remains blocked.                                                                                                                    |
|   22585 | 4ce95f4f-0000-4000-8000-000001017557 | 1017557       | The source describes St Leonard's Church plus a cross base adjacent to St Mary's Church, while the proposed record is Church of St Leonard's; the points are 2.2m apart and both infer church. The captured evidence does not determine whether the designation is a wider complex or a separate cross/ church relationship.                                          |
|   22604 | e59936e7-0000-4000-8000-000001017827 | 1017827       | The source and proposed candidate occupy the same point and identify Margery Bradley, but archaeological_site versus structure is not enough to decide whether the records are separate designations for one standing stone or a bad match.                                                                                                                           |
|   22714 | c77a94ca-0000-4000-8000-000001018854 | 1018854       | The source names an icehouse 75m north west of Sutton Hall and the proposed record names an ice house at Sutton Park approximately 75m north west of the house; the points are 8.0m apart. However, the inferred types differ (country_house versus historic_landscape), and the captured data does not resolve the source designation identity.                      |
|   22723 | ae6f292f-0000-4000-8000-000001018976 | 1018976       | The source and proposed candidate are only 5m apart and share the Ana Cross identity, while archaeological_site versus monument may reflect scope rather than distinct physical places. No positive separation evidence is captured.                                                                                                                                  |
|   22751 | 9c1e0f65-0000-4000-8000-000001019154 | 1019154       | The names and inferred priory type agree, but the source is a 15.78ha scheduled area with an estimated 224.1m feature radius and the proposed point is 229.8m away, outside the 150m agreement radius. The area/centroid explanation is plausible but not captured strongly enough to prove identity without widening the global rule.                                |
|   22939 | 53b9ecd2-0000-4000-8000-000001019825 | 1019825       | The source is Haltemprice Augustinian priory and the proposed record is Haltemprice Priory Farm, 122.3m away. The inferred types conflict (priory versus monument), the name is not sufficiently distinctive, and the captured evidence does not establish whether the farm record is the priory remains or a separate property.                                      |
|   23171 | aedf315e-0000-4000-8000-000001021265 | 1021265       | The source is St Margaret's Church and churchyard and the proposed record is Church of St Margaret (old Church) and Boundary Wall, 5.4m away; both infer church. The source/proposed designations differ and the captured evidence does not prove whether the churchyard and boundary wall are the same published entity.                                             |

## Saltaire invariants

- Ordinal 23312 remains candidate `afd0cd1d-0000-4000-8000-000001000099`, OBJECTID 15, Buffer Zone, `RETAIN_MULTI_GEOMETRY`, publishable.
- Ordinal 23313 remains candidate `afd0cd1e-0000-4000-8000-000001000099`, OBJECTID 16, Core Area, `RETAIN_MULTI_GEOMETRY`, publishable.
- Neither row merges into Saltaire Mills, is deduplicated, or overwrites the other source feature.
- Under the current point-place schema these two retained features project to two canonical-place creations.

## SQL compatibility audit

The sealed `supabase/regional/activate.sql` consumes `regional-candidates.csv`, `regional-conflicts.csv`, and temporal CSVs through `\copy`. It publishes only rows with `publication_class = AUTO_SAFE`. DATA-R5 does not emit a duplicate execution CSV: the future pre-SQL adapter must materialize the governed rows into that exact nine-column shape, preserving the sealed source file and leaving deferred rows non-publishable. No SQL change was made here.

## Dry-run boundary

This plan is certified as an internally consistent candidate for DATA-R6 execution-artefact and transaction-safety review. It is not live activation authorization. DATA-R6 must inspect transaction, rollback, idempotency, editor identity, temporal ordering, and exact derived input handling before any separate activation authorization.
