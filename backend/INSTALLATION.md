# Installation et mise à jour de Mat-Manage

## Prérequis

- Windows 10/11 ou Windows Server sur le poste qui héberge l’application.
- Node.js 20 ou supérieur.
- MySQL 8 ou MariaDB compatible.
- Un réseau local privé entre le serveur et les postes utilisateurs.
- Pour `NODE_ENV=production` ou un accès Internet : un certificat TLS valide et sa clé privée. En LAN sans TLS, les identifiants circulent sans chiffrement sur le réseau.

## Première installation

1. Téléchargez et extrayez `Mat-Manage-latest.zip` dans un dossier stable du serveur, par exemple `C:\\Mat-Manage`.
2. Créez la base `mat_manage` et un compte SQL dédié à l’application avec les droits sur cette base. Importez `backend/database/mat_manage.sql`.
3. Dans `backend`, copiez `.env.example` vers `.env`, puis renseignez l’hôte, le nom de base, le compte SQL, `DB_PASSWORD`, `APP_ORIGIN`, `APP_PUBLIC_ORIGIN`, `SESSION_SECRET` et `MFA_ENCRYPTION_KEY`. Ces deux dernières clés doivent être uniques et aléatoires. Générez-les avec :
   - `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` pour `SESSION_SECRET`.
   - `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` pour `MFA_ENCRYPTION_KEY`.
4. Pour un accès sur le réseau local en HTTP, gardez `NODE_ENV=development`. Remplacez `APP_PUBLIC_ORIGIN` par l’URL stable du serveur, par exemple `http://192.168.1.250:3000`. Réservez cette adresse dans le DHCP du routeur afin que les liens de réinitialisation restent valides.
5. Appliquez une seule fois les migrations restantes, dans cet ordre, sur la même base :
   1. `backend/database/security-migration.sql`
   2. `backend/database/inventory-upgrade.sql`
   3. `backend/database/allocation-recipient-identity.sql`
   4. `backend/database/reference-data.sql`
   5. `backend/database/category-locations.sql`
   6. `backend/database/similar-material-groups.sql`
   7. `backend/database/mercuriale-seed.sql`
   8. `backend/database/maintenance-stock.sql`
   9. `backend/database/maintenance-reminders.sql`
   10. `backend/database/maintenance-execution.sql`
   11. `backend/database/supervision-stock.sql`
6. Ouvrez un terminal dans `backend`, installez les dépendances (`npm ci`), puis démarrez le serveur (`npm start`). Au premier démarrage, créez le compte administrateur suivant la procédure de votre organisation. Le serveur affiche son adresse locale. Créez ensuite le compte administrateur avec `npm run create-admin` depuis ce dossier; la saisie du mot de passe se fait dans le terminal.
7. Dans le pare-feu Windows, autorisez les connexions entrantes TCP sur le port 3000 pour le profil **Privé**. Cette commande doit être lancée dans PowerShell en tant qu’administrateur :

   ```powershell
   New-NetFirewallRule -DisplayName "Mat-Manage HTTP (LAN)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private
   ```

8. Depuis un autre poste du même réseau, ouvrez `http://ADRESSE-IP-DU-SERVEUR:3000`. Utilisez la même adresse stable pour l’application. Les utilisateurs doivent atteindre le serveur et non `localhost` sur leur propre appareil.

### Restriction des connexions par sous-réseau

Le formulaire de connexion affiche l’adresse IP observée par le serveur et demande de la confirmer. Cette confirmation n’est pas un facteur d’identité : le mot de passe et le TOTP restent obligatoires. Pour limiter l’application à un ou plusieurs réseaux, renseignez `TRUSTED_CLIENT_CIDRS` dans `.env` avec le sous-réseau IPv4 réel des postes, par exemple `192.168.1.0/24` si le masque du réseau est bien `/24`. Les adresses hors liste ne pourront pas ouvrir le site ni appeler l’API. `127.0.0.1` et `::1` restent autorisées sur le serveur. Après modification, redémarrez Mat-Manage. Une liste incorrecte peut bloquer les postes : conservez l’accès local au serveur pendant la configuration.

Si l’application est derrière un reverse proxy, laissez `TRUST_PROXY=0` tant que le proxy n’est pas configuré. Ensuite, listez dans `TRUST_PROXY` les adresses IP/CIDR exactes des proxies de confiance. N’utilisez pas `1` ou `true` : un proxy configuré trop largement peut laisser falsifier l’adresse client. Pour TLS directement dans Mat-Manage, renseignez `TLS_CERT_FILE` et `TLS_KEY_FILE`; en mode production (`NODE_ENV=production`), ces deux fichiers sont obligatoires et les cookies deviennent `Secure`.

## Comptes et premières connexions

- L’administrateur peut créer un compte avec son matricule, son rôle, son adresse e-mail et un mot de passe initial. Mat-Manage envoie ces identifiants à l’adresse indiquée.
- L’utilisateur configure le second facteur TOTP à sa première connexion et doit conserver ses codes de récupération.
- L’inscription publique peut être activée ou désactivée dans les paramètres des comptes.
- Le réglage de compte désactivé produit volontairement un message d’interdiction à l’inscription ; l’administrateur peut le réactiver.
- Pour recevoir les rappels et les liens de sécurité, configurez les variables `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`, `SMTP_SECURE` et, si nécessaire, `SITE_CONTACT_EMAIL` dans `.env`. Les avis envoyés depuis le site arrivent par défaut à `ibihiang@gmail.com`.

## Utilisation

- **Magasinier** : inventaire, seuils, emplacements, entrées, sorties, transferts et dotations.
- **Maintenancier** : interventions planifiées ou immédiates, pièces consommées, compte-rendu et conclusion fonctionnelle ou défectueuse.
- **Administrateur** : comptes, rôles, stock global, paramètres, statistiques et journal d’audit.
- **Superviseur** : activité globale des magasiniers et maintenanciers, mouvements détaillés et évaluations quotidiennes.
- Les tableaux de bord couvrent une période choisie et des regroupements journaliers, hebdomadaires, mensuels ou annuels.
- Les utilisateurs consultent leur historique depuis leur profil. Le mode clair/sombre et les alertes se règlent dans le profil.

### Parcours détaillés par rôle

**Administrateur**

1. Ouvrez Utilisateurs et paramètres, créez un compte par personne et choisissez un rôle adapté.
2. Vérifiez l’adresse e-mail : Mat-Manage y envoie le matricule et le mot de passe initial. Chaque personne doit ensuite enrôler son TOTP.
3. Enregistrez ou importez les références de matériel, catégories et emplacements, puis définissez les seuils minimums.
4. Consultez les dashboards pour surveiller le stock et l’activité. Utilisez le journal d’audit pour rechercher une action ou un utilisateur.

**Magasinier**

1. Dans Matériels, recherchez le code ou la désignation et vérifiez l’emplacement et la quantité.
2. Dans Mouvements, enregistrez une entrée lorsqu’un matériel est reçu, une sortie lorsqu’il quitte le stock ou un transfert lorsqu’il change d’emplacement.
3. Pour une dotation, choisissez le service, le bénéficiaire, son matricule ou son numéro CNI, le matériel et la quantité. Conservez la référence de décharge.
4. Lorsqu’un appareil fonctionnel revient de maintenance, consultez la notification et récupérez-le : son stock reprend son emplacement d’origine.

**Maintenancier**

1. Dans Maintenance, ouvrez une intervention planifiée pour renseigner le diagnostic, les actions, les commentaires et la conclusion.
2. Le matériel rejoint votre stock de maintenance lorsque l’intervention vous est attribuée. Les pièces consommées sont rattachées au compte-rendu.
3. Une conclusion fonctionnelle notifie les magasiniers et restitue le matériel à son emplacement initial. Un matériel défectueux reste dans votre stock de maintenance et son état est signalé.
4. Autorisez les notifications du navigateur et activez les bips dans la barre supérieure si vous souhaitez entendre les alertes.

**Superviseur**

1. Choisissez une période et recherchez un agent par son nom ou son matricule.
2. Comparez les indicateurs d’activité, les notes quotidiennes et les badges de traçabilité des mouvements.
3. Enregistrez une note de 1 à 5 accompagnée d’un avis pour chaque évaluation. Une note peut être mise à jour pour le même agent et le même jour.

**Tous les utilisateurs**

- Le profil affiche les informations du compte, les préférences et l’historique personnel en lecture seule.
- L’historique global et les paramètres de comptes sont réservés à l’administrateur.
- En cas de mot de passe oublié, demandez un lien de réinitialisation depuis l’écran de connexion. Le lien est envoyé à l’adresse stable définie dans `APP_PUBLIC_ORIGIN`.
- Si une requête d’inscription affiche « Origine refusée », ouvrez le site avec l’adresse LAN affichée par le serveur. Si la création de comptes est désactivée, l’administrateur doit la réactiver dans les paramètres.

## Mise à jour

Mat-Manage est une application web centralisée : les postes utilisateurs n’installent rien et profitent de la version servie par le serveur. Pour mettre à jour :

1. Sauvegardez la base de données et le dossier `backend/.env`.
2. Téléchargez le paquet actuel depuis le site et arrêtez l’ancien serveur.
3. Extrayez les nouveaux fichiers dans un nouveau dossier ou remplacez le code en conservant votre `.env`, vos sauvegardes et vos images d’avatar.
4. Dans `backend`, lancez `npm ci`, puis redémarrez avec `npm start`.
5. Appliquez seulement les nouvelles migrations mentionnées par la version et jamais une migration déjà exécutée.

Le site local et le lien de téléchargement sont servis par le même processus Mat-Manage. Pour un site consultable depuis Internet, il faudra héberger et publier séparément les fichiers du site et les paquets.

## Aide et contact

Téléphone : [+237 690 320 717](tel:+237690320717) · E-mail : [ibihiang@gmail.com](mailto:ibihiang@gmail.com).
