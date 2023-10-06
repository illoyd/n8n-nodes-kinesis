#!/bin/zsh

source ~/.zshrc

MESSAGE=$(echo -n '{
  "specversion": "1.0",
  "type": "com.kenangadigital.application.applied",
  "source": "/connection-else",
  "subject": "ian",
  "id": "C234-1234-1234",
  "time": "2018-04-05T17:31:00Z",
  "datacontenttype": "application/json",
  "data": {
    "id": "C234-1234-1234",
    "type": "applications",
    "status": "new",
    "product": "rakuten_trade",
       "productApplicationId": "rt",
    "questionnaire": {
      "id": "123",
      "type": "questionnaires"
    },
    "responses": {
      "fullName": "Ian",
      "appinfoB": 123,
      "appinfoC": true,
           "nricFront": "test1.txt",
           "nricBack": "test2.txt",
           "passport": "test3.txt",
           "poa": "test4.txt",
           "selfie": "test5.txt"
    }
  }
}' | openssl base64)

awslocal kinesis put-record --partition-key 123456 --stream-name test-stream --data $MESSAGE

