# manage
Gestion du parc informatique

Après `backend/database/inventory-upgrade.sql`, exécuter une seule fois `backend/database/similar-material-groups.sql` avant `backend/database/mercuriale-seed.sql`. Cette migration permet d’enregistrer les nouvelles fiches dont la désignation est similaire à au moins 40 % à une fiche existante, tout en consolidant leur stock et leur seuil sous la référence principale.

Pour les bases déjà installées, exécuter une seule fois `backend/database/allocation-recipient-identity.sql` afin d’ajouter le type et le numéro d’identification aux dotations, puis `backend/database/category-locations.sql` après `reference-data.sql` et avant `mercuriale-seed.sql`. Chaque catégorie reçoit automatiquement un emplacement `CAT-<id>` nommé `Stock <catégorie>`; les nouvelles catégories créent aussi leur emplacement automatiquement. À l’enregistrement d’un matériel, l’emplacement de sa catégorie est sélectionné et conservé sur sa fiche. La création manuelle d’emplacements est désactivée.

Après `backend/database/maintenance-stock.sql`, exécuter une seule fois `backend/database/maintenance-reminders.sql`. Une intervention planifiée doit être affectée à un maintenancier actif disposant d’un e-mail. Le serveur envoie un rappel SMTP environ cinq minutes avant son heure prévue. Le maintenancier doit cliquer sur « Activer les bips » dans la barre supérieure de l’application pour autoriser les alertes sonores du navigateur. Configurer les variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` et `MAIL_FROM`; `APP_TIMEZONE` règle l’heure affichée dans le courriel (par défaut `Africa/Douala`).


Pour l’exécution détaillée des maintenances, exécuter une seule fois `backend/database/maintenance-execution.sql` après les autres migrations. Renseignez le département des maintenanciers dans Utilisateurs et paramètres; leurs matricule, nom et département sont ensuite repris depuis leur compte. Les préférences d’apparence et d’alertes se règlent depuis Profil et sécurité.


La migration `backend/database/supervision-stock.sql` doit être appliquée après `maintenance-execution.sql`. Elle ajoute le stock privé des maintenanciers, les notifications de retour, les évaluations journalières et le rôle Superviseur. Les dashboards offrent des regroupements journalier, hebdomadaire, mensuel et annuel avec les pourcentages de répartition. L’historique personnel est dans Profil; le journal global filtrable est réservé à l’Administrateur. Les fonctions de commandes, demandes de prix et fournisseurs ont été retirées de l’interface et des routes de l’application.
