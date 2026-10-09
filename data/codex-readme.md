Your task is to load the data in these folders to dynamo db.
First create the candidates. Each candidate has an image in one of the subfolders. Go through the subfolder and create a dynamodb entry for each image as follows:

{
  "pk": {
    "S": "SEASON"
  },
  "sk": {
    "S": "name"
  },
  "image": {
    "S": "SEASON/name.webp / png"
  },
  "name": {
    "S": "Name"
  },
  "type": {
    "S": "person"
  }
}

"S": "SEASON" : This is the folder name for each candidate
"S": "name" : This is the name of the image written in lower case letter
"S": "SEASON/name.webp / png" this is the path to the image, so the season plus the name plus the ending of the image file
"S": "Name" : This is the name of the image written with a capital first letter
"S": "person" : This stays untouched





When this is done for all candidates the next task is to add the matching nights.

In each folder there is a file matching_-_nights.txt, these files contain information about the matching nights like follows:
Matchnight #01
  - Adrianna x Julian M
  - Aurora x Julian S
  - Elena x Jerry
  - Ella x Meji
  - Laura x Evi
  - Linda x Chris
  - Marla x Luke
  - Michelle x Ema
  - Tiziana x Jeronymo
  - Tonia x Noel
  Geht leer aus: Alicia


  For each such entry, create the following dynamo db object:
  {
  "pk": {
    "S": "Season"
  },
  "sk": {
    "S": "2026-MN-1"
  },
  "matches": {
    "N": "4"
  },
  "matching-night": {
    "N": "1"
  },
  "pairs": {
    "L": [
      {
        "M": {
          "female": {
            "S": "Af1"
          },
          "male": {
            "S": "Am1"
          }
        }
      },
      {
        "M": {
          "female": {
            "S": "Af2"
          },
          "male": {
            "S": "Am2"
          }
        }
      },
      {
        "M": {
          "female": {
            "S": "Af3"
          },
          "male": {
            "S": "Am3"
          }
        }
      },
      {
        "M": {
          "female": {
            "S": "Af4"
          },
          "male": {
            "S": "Am4"
          }
        }
      },
      {
        "M": {
          "female": {
            "S": "Af5"
          },
          "male": {
            "S": "Am5"
          }
        }
      },
      {
        "M": {
          "female": {
            "S": "Af6"
          },
          "male": {
            "S": "Am6"
          }
        }
      },
      {
        "M": {
          "female": {
            "S": "Af7"
          },
          "male": {
            "S": "Am7"
          }
        }
      },
      {
        "M": {
          "female": {
            "S": "Af8"
          },
          "male": {
            "S": "Am8"
          }
        }
      },
      {
        "M": {
          "female": {
            "S": "Af9"
          },
          "male": {
            "S": "Am9"
          }
        }
      },
      {
        "M": {
          "female": {
            "S": "Af10"
          },
          "male": {
            "S": "Am10"
          }
        }
      }
    ]
  },
  "type": {
    "S": "matching-night"
  }
}


"S": "Season" : As before, the folder name
"S": "Season-MN-NUMBER" : MN is the marker for matching night and NUMBER refers to the number of the matching night, given in the header
"N": "matches" : The number of matches, should be given in most of the files (if missing, add to notes.md)
"N": "NUMBER" : NUMBER refers to the number of the matching night, given in the header
{
        "M": {
          "female": {
            "S": "Adrianna"
          },
          "male": {
            "S": "Julian M"
          }
        }
      }, : These are the up to 10 pairs per matching night, given as Adrianna x Julian M in the list. The first is the female, the second is the male.
"S": "matching-night" : Stays untouched



Now we create the match boxes:

In each folder there is a file match_boxes.txt, these files contain information about the match boxes like follows:

Matchbox #10: Afra x Sandro -> true
Matchbox #01: Jana x Paul -> true
Matchbox #08: Julia x Paul -> unknown
Matchbox #02: Lina x Ryan -> false
Matchbox #09: Maja x Eti -> unknown
Matchbox #03: Maja x Kevin -> unknown
Matchbox #04: Mela x Eti -> unknown
Matchbox #05: Shelly x Wilson -> unknown
Matchbox #07: Sina x Sandro -> unknown
Matchbox #06: Tais x Gerrit -> unknown

For each matchbox create the following dynamo db object:

{
  "pk": {
    "S": "SEASON"
  },
  "sk": {
    "S": "SEASON-MB-NUMBER"
  },
  "female": {
    "S": "Afra"
  },
  "male": {
    "S": "Sandro"
  },
  "matching-night": {
    "N": "NUMBER"
  },
  "result": {
    "BOOL": true
  },
  "type": {
    "S": "match-box"
  }
}

"S": "SEASON" : As before
"S": "SEASON-MB-NUMBER" : As before
"S": "Afra" : Name of the female in the match box
"S": "Sandro" : Name of the male
"N": "NUMBER" Number of the matching night
"BOOL": true : The result, given after the arrow ->
"S": "match-box" : Stays untouched
